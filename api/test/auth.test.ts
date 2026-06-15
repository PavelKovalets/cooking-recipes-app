/**
 * AUTH coverage (objective.md):
 *   Guest: "register/log in".
 *   Admin: "implement authentication".
 *   Cross-cutting (api.md): blocking takes effect immediately; invalid token =>
 *   guest => 401 on protected routes.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  adminLogin,
  api,
  registerFreshUser,
  seedUserLogin,
  useApp,
} from "./helpers.js";

useApp();

describe("Auth — register / login (objective: guest register/log in)", () => {
  it("registers a new user, returns 201 with a token and a PublicUser", async () => {
    const email = `auth-reg-${Date.now()}@example.com`;
    const res = await api.post("/api/auth/register", {
      email,
      password: "password1234",
      displayName: "New Cook",
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toMatchObject({
      email: email.toLowerCase(),
      displayName: "New Cook",
      role: "registered",
      status: "active",
    });
    // PublicUser must NOT leak the password hash.
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects registration with a short password (validation 400)", async () => {
    const res = await api.post("/api/auth/register", {
      email: `short-${Date.now()}@example.com`,
      password: "short",
      displayName: "X",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("rejects duplicate email registration with 409 conflict", async () => {
    const email = `dup-${Date.now()}@example.com`;
    const body = { email, password: "password1234", displayName: "Dup" };
    const first = await api.post("/api/auth/register", body);
    expect(first.status).toBe(201);
    const second = await api.post("/api/auth/register", body);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("conflict");
  });

  it("logs in a seeded user and returns a working token", async () => {
    const { token, user } = await seedUserLogin("alice@example.com");
    expect(typeof token).toBe("string");
    expect(user.email).toBe("alice@example.com");
    const me = await api.get("/api/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("alice@example.com");
  });

  it("rejects login with a wrong password (401, generic message)", async () => {
    const res = await api.post("/api/auth/login", {
      email: "alice@example.com",
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("logout is a stateless ok (client drops the token)", async () => {
    const res = await api.post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("Auth — admin authentication (objective: admin authentication)", () => {
  it("admin can log in and GET /me reports role=admin", async () => {
    const { token } = await adminLogin();
    const me = await api.get("/api/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe("admin");
  });
});

describe("Auth — token / guard behavior (api.md: roles guest⊂registered⊂admin)", () => {
  it("missing token on a protected route => 401", async () => {
    const res = await api.get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("an invalid/garbage token is treated as guest => 401 on protected routes", async () => {
    const res = await api.get("/api/me", { token: "not-a-real-jwt" });
    expect(res.status).toBe(401);
  });

  it("a valid token unlocks the protected route", async () => {
    const { token } = await registerFreshUser("guard");
    const res = await api.get("/api/me", { token });
    expect(res.status).toBe(200);
  });
});
