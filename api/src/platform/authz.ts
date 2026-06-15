/**
 * Authentication & authorization (architecture §8).
 *
 * Roles are strictly nested for read scope: guest ⊂ registered ⊂ admin.
 * Every request resolves its principal:
 *   - guest:       no / invalid / expired token
 *   - registered:  valid token, role=registered, status=active
 *   - admin:       valid token, role=admin, status=active
 * Blocked users are rejected even with a valid token.
 *
 * The JWT carries { sub, role }. We re-check the user's live status/role from
 * the DB on each authenticated request so blocking takes effect immediately
 * (the token alone is not trusted for `blocked`).
 */

import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";

import { db, users } from "../db/index.js";
import { ApiError } from "./errors.js";

export type Role = "guest" | "registered" | "admin";

export interface Principal {
  id: number;
  role: "registered" | "admin";
  email: string;
  displayName: string;
}

export interface JwtPayload {
  sub: number;
  role: "registered" | "admin";
}

declare module "fastify" {
  interface FastifyRequest {
    /** Resolved authenticated user, or null for guests. */
    principal: Principal | null;
  }
}

/**
 * onRequest hook: resolve the principal for every request. Never throws for a
 * missing token (guests are allowed on many routes); throws 403 only when a
 * blocked user presents an otherwise-valid token.
 */
export async function resolvePrincipal(
  request: FastifyRequest,
): Promise<void> {
  request.principal = null;
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return;

  let payload: JwtPayload;
  try {
    payload = await request.jwtVerify<JwtPayload>();
  } catch {
    // Invalid/expired token → treated as guest (routes that require auth will 401).
    return;
  }

  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) return; // stale token for a deleted user → guest
  if (user.status === "blocked") {
    throw ApiError.forbidden("Your account has been blocked.");
  }

  request.principal = {
    id: user.id,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
  };
}

/** preHandler: require an authenticated (registered or admin) principal. */
export function requireAuth(request: FastifyRequest): Principal {
  if (!request.principal) {
    throw ApiError.unauthorized();
  }
  return request.principal;
}

/** preHandler: require an admin principal. */
export function requireAdmin(request: FastifyRequest): Principal {
  const p = requireAuth(request);
  if (p.role !== "admin") {
    throw ApiError.forbidden("Administrator privileges required.");
  }
  return p;
}

/** Fastify preHandler wrappers (so routes can pass them in `preHandler`). */
export async function authGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  requireAuth(request);
}

export async function adminGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  requireAdmin(request);
}

/** Assert the principal owns the resource (author_id) or is an admin. */
export function assertOwnerOrAdmin(
  principal: Principal,
  ownerId: number,
): void {
  if (principal.role === "admin") return;
  if (principal.id !== ownerId) {
    throw ApiError.forbidden("You can only modify your own content.");
  }
}
