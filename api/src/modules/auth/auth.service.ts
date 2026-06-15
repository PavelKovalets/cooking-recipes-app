/**
 * Auth service: registration, login, principal-facing user shape.
 * argon2 password hashing; JWT issuing is done in the route (needs the request
 * to sign). (architecture §8)
 */

import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";

import { db, userPreferences, users } from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: "registered" | "admin";
  status: "active" | "blocked";
  createdAt: string;
}

function toPublicUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<PublicUser> {
  const email = input.email.toLowerCase().trim();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw ApiError.conflict("An account with this email already exists.");
  }

  const passwordHash = await argon2.hash(input.password);

  // Create the user and its (empty) preferences row in one transaction.
  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        displayName: input.displayName.trim(),
        role: "registered",
        status: "active",
      })
      .returning();
    if (!user) throw new Error("Failed to create user");
    await tx
      .insert(userPreferences)
      .values({ userId: user.id })
      .onConflictDoNothing();
    return user;
  });

  return toPublicUser(created);
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<PublicUser> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  // Generic message on purpose (don't leak which part was wrong).
  if (!user) throw ApiError.unauthorized("Invalid email or password.");

  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) throw ApiError.unauthorized("Invalid email or password.");

  if (user.status === "blocked") {
    throw ApiError.forbidden("Your account has been blocked.");
  }

  return toPublicUser(user);
}

export async function getUserById(id: number): Promise<PublicUser> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw ApiError.notFound("User not found.");
  return toPublicUser(user);
}

export { toPublicUser };
