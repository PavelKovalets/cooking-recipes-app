/**
 * CATALOG + RBAC coverage (objective.md):
 *   Guest: "view recipes and the catalog"; "manage categories, tags, cuisines,
 *   and basic ingredients" (admin-managed taxonomy is the read surface here).
 *   Cross-cutting (api.md/architecture §8): RBAC nesting guest ⊂ registered ⊂
 *   admin; /api/admin/* requires admin (403 for non-admin, 401 for guest).
 */

import { describe, expect, it } from "vitest";

import {
  adminLogin,
  api,
  registerFreshUser,
  useApp,
} from "./helpers.js";

useApp();

describe("Catalog reads are public (objective: guest view catalog)", () => {
  it("GET /api/categories returns seeded categories with id/name/slug", async () => {
    const res = await api.get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    const names = res.body.items.map((c: any) => c.name);
    expect(names).toContain("Main Course");
    for (const c of res.body.items) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("slug");
    }
  });

  it("GET /api/tags returns seeded tags", async () => {
    const res = await api.get("/api/tags");
    expect(res.status).toBe(200);
    expect(res.body.items.map((t: any) => t.name)).toContain("quick");
  });

  it("GET /api/cuisines returns seeded cuisines", async () => {
    const res = await api.get("/api/cuisines");
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: any) => c.name)).toContain("Italian");
  });

  it("GET /api/ingredients returns all; ?basic=true filters to is_basic", async () => {
    const all = await api.get("/api/ingredients");
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThan(0);
    expect(all.body.items.some((i: any) => i.isBasic === true)).toBe(true);
    expect(all.body.items.some((i: any) => i.isBasic === false)).toBe(true);

    const basics = await api.get("/api/ingredients", { query: { basic: "true" } });
    expect(basics.status).toBe(200);
    expect(basics.body.items.length).toBeGreaterThan(0);
    expect(basics.body.items.every((i: any) => i.isBasic === true)).toBe(true);
    // Salt is a seeded basic.
    expect(basics.body.items.map((i: any) => i.name)).toContain("Salt");
  });
});

describe("RBAC: /api/admin/* gating (api.md: admin-only)", () => {
  it("guest hitting an admin route => 401", async () => {
    const res = await api.get("/api/admin/stats");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("a registered (non-admin) user hitting an admin route => 403", async () => {
    const { token } = await registerFreshUser("rbac");
    const res = await api.get("/api/admin/stats", { token });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("admin can reach an admin route => 200", async () => {
    const { token } = await adminLogin();
    const res = await api.get("/api/admin/stats", { token });
    expect(res.status).toBe(200);
  });
});

describe("RBAC: read scope nesting guest ⊂ registered ⊂ admin", () => {
  it("the same public catalog read works for guest, registered and admin", async () => {
    const guest = await api.get("/api/recipes");
    expect(guest.status).toBe(200);

    const { token: regToken } = await registerFreshUser("nest");
    const reg = await api.get("/api/recipes", { token: regToken });
    expect(reg.status).toBe(200);

    const { token: adminToken } = await adminLogin();
    const adm = await api.get("/api/recipes", { token: adminToken });
    expect(adm.status).toBe(200);

    // Every actor sees the published catalog (read scope is nested).
    expect(guest.body.total).toBe(reg.body.total);
    expect(reg.body.total).toBe(adm.body.total);
  });
});
