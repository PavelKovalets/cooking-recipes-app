/**
 * Auth routes: register, login, logout, GET /me.
 * Mounted under /api by the parent registration.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authGuard, requireAuth } from "../../platform/authz.js";
import type { JwtPayload } from "../../platform/authz.js";
import { parse } from "../../platform/util.js";
import { getUserById, register, verifyCredentials } from "./auth.service.js";

const RegisterBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
});

const LoginBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  function sign(userId: number, role: "registered" | "admin"): string {
    const payload: JwtPayload = { sub: userId, role };
    return app.jwt.sign(payload, { expiresIn: "7d" });
  }

  app.post("/auth/register", async (request, reply) => {
    const body = parse(RegisterBody, request.body);
    const user = await register(body);
    const token = sign(user.id, user.role);
    return reply.code(201).send({ token, user });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = parse(LoginBody, request.body);
    const user = await verifyCredentials(body.email, body.password);
    const token = sign(user.id, user.role);
    return reply.send({ token, user });
  });

  // Stateless JWT: logout is a client-side token drop. Endpoint exists for the
  // contract and future server-side token revocation (Phase 2).
  app.post("/auth/logout", async (_request, reply) => {
    return reply.send({ ok: true });
  });

  app.get("/me", { preHandler: authGuard }, async (request) => {
    const principal = requireAuth(request);
    const user = await getUserById(principal.id);
    return { user };
  });
}
