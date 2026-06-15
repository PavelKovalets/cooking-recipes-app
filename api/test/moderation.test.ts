/**
 * ADMIN / MODERATION coverage (objective.md, administrator functions):
 *   - "manage the database (add, delete, and modify recipes, categories, tags,
 *     and users)"; "manage categories, tags, cuisines, and basic ingredients"
 *   - "view all user profiles"; "block users"
 *   - "process recipe submission requests"
 *   - "moderate reviews and comments"; "delete or hide recipes and comments"
 *   - "handle complaints regarding recipes and users"
 * Cross-cutting: a blocked user cannot log in OR act (immediate via DB recheck).
 */

import { describe, expect, it } from "vitest";

import {
  adminLogin,
  api,
  getRecipeBySlug,
  registerFreshUser,
  useApp,
} from "./helpers.js";

useApp();

async function admin(): Promise<string> {
  return (await adminLogin()).token;
}

describe("Submission queue + approve (objective: process submission requests)", () => {
  it("a registered user's pending recipe shows in /admin/submissions and approve publishes it", async () => {
    const author = await registerFreshUser("submit");
    const create = await api.post(
      "/api/recipes",
      { title: "Pending Submission Dish" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    expect(create.body.recipe.status).toBe("pending");

    const adminToken = await admin();
    const subs = await api.get("/api/admin/submissions", { token: adminToken });
    expect(subs.status).toBe(200);
    expect(subs.body.items.map((r: any) => r.id)).toContain(id);

    const approve = await api.post(
      `/api/admin/recipes/${id}/approve`,
      undefined,
      { token: adminToken },
    );
    expect(approve.status).toBe(200);
    expect(approve.body.recipe.status).toBe("published");

    // Now visible in the public catalog.
    const pub = await api.get("/api/recipes", { query: { pageSize: 100 } });
    expect(pub.body.items.map((r: any) => r.id)).toContain(id);
  });
});

describe("Hide / unhide / delete recipes (objective: delete or hide recipes)", () => {
  it("admin hides a published recipe (soft) => removed from catalog, then unhide restores", async () => {
    const adminToken = await admin();
    const create = await api.post(
      "/api/recipes",
      { title: "Hideable Recipe" },
      { token: adminToken },
    );
    const id = create.body.recipe.id; // admin-created => published

    const hide = await api.post(`/api/admin/recipes/${id}/hide`, undefined, {
      token: adminToken,
    });
    expect(hide.status).toBe(200);
    expect(hide.body.recipe.status).toBe("hidden");

    const catalog = await api.get("/api/recipes", { query: { pageSize: 100 } });
    expect(catalog.body.items.map((r: any) => r.id)).not.toContain(id);

    const unhide = await api.post(`/api/admin/recipes/${id}/unhide`, undefined, {
      token: adminToken,
    });
    expect(unhide.status).toBe(200);
    expect(unhide.body.recipe.status).toBe("published");

    const after = await api.get("/api/recipes", { query: { pageSize: 100 } });
    expect(after.body.items.map((r: any) => r.id)).toContain(id);
  });

  it("admin lists recipes across statuses and hard-deletes one (204)", async () => {
    const adminToken = await admin();
    const create = await api.post(
      "/api/recipes",
      { title: "Admin Delete Recipe" },
      { token: adminToken },
    );
    const id = create.body.recipe.id;

    const listed = await api.get("/api/admin/recipes", {
      token: adminToken,
      query: { status: "published" },
    });
    expect(listed.status).toBe(200);
    expect(listed.body.items.every((r: any) => r.status === "published")).toBe(
      true,
    );

    const del = await api.del(`/api/admin/recipes/${id}`, { token: adminToken });
    expect(del.status).toBe(204);
    const after = await api.get(`/api/admin/recipes/${id}`, {
      token: adminToken,
    });
    expect(after.status).toBe(404);
  });

  it("admin edits a recipe via PUT incl. a status transition", async () => {
    const adminToken = await admin();
    const create = await api.post(
      "/api/recipes",
      { title: "Admin Editable" },
      { token: adminToken },
    );
    const id = create.body.recipe.id;
    const upd = await api.put(
      `/api/admin/recipes/${id}`,
      { title: "Admin Edited Title", status: "hidden" },
      { token: adminToken },
    );
    expect(upd.status).toBe(200);
    expect(upd.body.recipe.title).toBe("Admin Edited Title");
    expect(upd.body.recipe.status).toBe("hidden");
  });
});

describe("Moderate comments (objective: moderate reviews/comments, hide/delete)", () => {
  it("admin hides a comment => disappears from public detail; unhide restores", async () => {
    const adminToken = await admin();
    // Use a dedicated admin-published recipe so seeded recipes' rating
    // aggregates stay pristine for other files' assertions.
    const created = await api.post(
      "/api/recipes",
      { title: `Mod Hide Comment Recipe ${Date.now()}` },
      { token: adminToken },
    );
    const recipeId = created.body.recipe.id;

    const commenter = await registerFreshUser("mod-commenter");
    const c = await api.post(
      `/api/recipes/${recipeId}/comments`,
      { rating: 1, body: "Spam comment to be hidden." },
      { token: commenter.token },
    );
    const commentId = c.body.comment.id;

    const hide = await api.post(
      `/api/admin/comments/${commentId}/hide`,
      undefined,
      { token: adminToken },
    );
    expect(hide.status).toBe(200);

    const publicComments = await api.get(`/api/recipes/${recipeId}/comments`);
    expect(publicComments.body.items.map((x: any) => x.id)).not.toContain(
      commentId,
    );
    // Hidden rating must also drop out of the public average (count back to 0).
    const hiddenDetail = await api.get(`/api/recipes/${recipeId}`);
    expect(hiddenDetail.body.recipe.rating.count).toBe(0);

    const unhide = await api.post(
      `/api/admin/comments/${commentId}/unhide`,
      undefined,
      { token: adminToken },
    );
    expect(unhide.status).toBe(200);
    const restored = await api.get(`/api/recipes/${recipeId}/comments`);
    expect(restored.body.items.map((x: any) => x.id)).toContain(commentId);
  });

  it("admin hard-deletes a comment (204)", async () => {
    const adminToken = await admin();
    const created = await api.post(
      "/api/recipes",
      { title: `Mod Delete Comment Recipe ${Date.now()}` },
      { token: adminToken },
    );
    const recipeId = created.body.recipe.id;
    const commenter = await registerFreshUser("del-commenter");
    const c = await api.post(
      `/api/recipes/${recipeId}/comments`,
      { body: "Delete me." },
      { token: commenter.token },
    );
    const commentId = c.body.comment.id;
    const del = await api.del(`/api/admin/comments/${commentId}`, {
      token: adminToken,
    });
    expect(del.status).toBe(204);
  });
});

describe("Complaints (objective: handle complaints re recipes and users)", () => {
  it("a registered user files a complaint; admin lists and resolves it", async () => {
    const reporter = await registerFreshUser("complainer");
    const recipe = await getRecipeBySlug("greek-salad");

    const file = await api.post(
      "/api/complaints",
      {
        targetType: "recipe",
        targetId: recipe.id,
        reason: "Inappropriate content.",
      },
      { token: reporter.token },
    );
    expect(file.status).toBe(201);
    const complaintId = file.body.complaint.id;

    const adminToken = await admin();
    const open = await api.get("/api/admin/complaints", {
      token: adminToken,
      query: { status: "open" },
    });
    expect(open.status).toBe(200);
    const found = open.body.items.find((x: any) => x.id === complaintId);
    expect(found).toBeDefined();
    expect(found.targetType).toBe("recipe");
    expect(found.targetId).toBe(recipe.id);
    expect(found).toHaveProperty("reporterName");

    const resolve = await api.post(
      `/api/admin/complaints/${complaintId}/resolve`,
      undefined,
      { token: adminToken },
    );
    expect(resolve.status).toBe(200);

    const resolved = await api.get("/api/admin/complaints", {
      token: adminToken,
      query: { status: "resolved" },
    });
    expect(resolved.body.items.map((x: any) => x.id)).toContain(complaintId);
  });

  it("filing a complaint requires auth (guest => 401)", async () => {
    const recipe = await getRecipeBySlug("greek-salad");
    const res = await api.post("/api/complaints", {
      targetType: "recipe",
      targetId: recipe.id,
      reason: "x",
    });
    expect(res.status).toBe(401);
  });
});

describe("User management + blocking (objective: view profiles, block users)", () => {
  it("admin lists users (with recipeCount) and views one profile", async () => {
    const adminToken = await admin();
    const list = await api.get("/api/admin/users", { token: adminToken });
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(4);
    const sample = list.body.items[0];
    expect(sample).toHaveProperty("recipeCount");
    expect(sample).toHaveProperty("email");

    const one = await api.get(`/api/admin/users/${sample.id}`, {
      token: adminToken,
    });
    expect(one.status).toBe(200);
    expect(one.body.user.id).toBe(sample.id);
  });

  it("blocking a user takes effect immediately: they cannot act and cannot log in", async () => {
    const victim = await registerFreshUser("blockme");
    const adminToken = await admin();

    // Before block: the user can act.
    const before = await api.get("/api/me", { token: victim.token });
    expect(before.status).toBe(200);

    const block = await api.post(
      `/api/admin/users/${victim.user.id}/block`,
      undefined,
      { token: adminToken },
    );
    expect(block.status).toBe(200);
    expect(block.body.status).toBe("blocked");

    // Existing token is rejected immediately (DB recheck on each request).
    const acting = await api.get("/api/me", { token: victim.token });
    expect(acting.status).toBe(403);
    const writing = await api.post(
      "/api/recipes",
      { title: "Blocked cannot write" },
      { token: victim.token },
    );
    expect(writing.status).toBe(403);

    // Fresh login is also refused.
    const relogin = await api.post("/api/auth/login", {
      email: victim.email,
      password: victim.password,
    });
    expect(relogin.status).toBe(403);

    // Unblock restores access.
    const unblock = await api.post(
      `/api/admin/users/${victim.user.id}/unblock`,
      undefined,
      { token: adminToken },
    );
    expect(unblock.status).toBe(200);
    const reloginOk = await api.post("/api/auth/login", {
      email: victim.email,
      password: victim.password,
    });
    expect(reloginOk.status).toBe(200);
  });

  it("admin sets a user's role to admin (objective: manage users)", async () => {
    const target = await registerFreshUser("promote");
    const adminToken = await admin();
    const res = await api.put(
      `/api/admin/users/${target.user.id}/role`,
      { role: "admin" },
      { token: adminToken },
    );
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");

    // The promoted user can now reach admin routes.
    const relogin = await api.post("/api/auth/login", {
      email: target.email,
      password: target.password,
    });
    const promoted = await api.get("/api/admin/stats", {
      token: relogin.body.token,
    });
    expect(promoted.status).toBe(200);
  });

  it("admin deletes a user (204)", async () => {
    const target = await registerFreshUser("deluser");
    const adminToken = await admin();
    const del = await api.del(`/api/admin/users/${target.user.id}`, {
      token: adminToken,
    });
    expect(del.status).toBe(204);
    const after = await api.get(`/api/admin/users/${target.user.id}`, {
      token: adminToken,
    });
    expect(after.status).toBe(404);
  });
});

describe("Taxonomy CRUD (objective: manage categories/tags/cuisines/ingredients)", () => {
  it("category create / update / delete", async () => {
    const adminToken = await admin();
    const create = await api.post(
      "/api/admin/categories",
      { name: `TestCat-${Date.now()}`, description: "desc" },
      { token: adminToken },
    );
    expect(create.status).toBe(201);
    const id = create.body.category.id;
    expect(create.body.category.slug).toBeTruthy();

    const upd = await api.put(
      `/api/admin/categories/${id}`,
      { name: `TestCat-Renamed-${Date.now()}` },
      { token: adminToken },
    );
    expect(upd.status).toBe(200);

    const del = await api.del(`/api/admin/categories/${id}`, {
      token: adminToken,
    });
    expect(del.status).toBe(204);
  });

  it("tag + cuisine create/delete", async () => {
    const adminToken = await admin();
    const tag = await api.post(
      "/api/admin/tags",
      { name: `t-${Date.now()}` },
      { token: adminToken },
    );
    expect(tag.status).toBe(201);
    expect((await api.del(`/api/admin/tags/${tag.body.tag.id}`, { token: adminToken })).status).toBe(204);

    const cuisine = await api.post(
      "/api/admin/cuisines",
      { name: `c-${Date.now()}` },
      { token: adminToken },
    );
    expect(cuisine.status).toBe(201);
    expect(
      (await api.del(`/api/admin/cuisines/${cuisine.body.cuisine.id}`, { token: adminToken })).status,
    ).toBe(204);
  });

  it("ingredient create with isBasic; appears in ?basic=true; delete", async () => {
    const adminToken = await admin();
    const name = `BasicIng-${Date.now()}`;
    const create = await api.post(
      "/api/admin/ingredients",
      { name, isBasic: true },
      { token: adminToken },
    );
    expect(create.status).toBe(201);
    const id = create.body.ingredient.id;
    expect(create.body.ingredient.isBasic).toBe(true);

    const basics = await api.get("/api/ingredients", { query: { basic: "true" } });
    expect(basics.body.items.map((i: any) => i.id)).toContain(id);

    const del = await api.del(`/api/admin/ingredients/${id}`, {
      token: adminToken,
    });
    expect(del.status).toBe(204);
  });

  it("deleting an ingredient referenced by a recipe returns 409 (FK RESTRICT)", async () => {
    const adminToken = await admin();
    // Find an ingredient that is used by a seeded recipe (Spaghetti in carbonara).
    const ingredients = await api.get("/api/ingredients");
    const spaghetti = ingredients.body.items.find((i: any) => i.name === "Spaghetti");
    expect(spaghetti).toBeDefined();
    const del = await api.del(`/api/admin/ingredients/${spaghetti.id}`, {
      token: adminToken,
    });
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("conflict");
  });

  it("flipping ingredient isBasic re-syncs smart selection (objective: basic ingredients)", async () => {
    const adminToken = await admin();
    // Make a brand-new recipe with one non-basic ingredient we control.
    const ingName = `Flippable-${Date.now()}`;
    const ingRes = await api.post(
      "/api/admin/ingredients",
      { name: ingName, isBasic: false },
      { token: adminToken },
    );
    const ingId = ingRes.body.ingredient.id;

    const recipe = await api.post(
      "/api/recipes",
      {
        title: `Flip Recipe ${Date.now()}`,
        ingredients: [{ ingredientId: ingId }],
      },
      { token: adminToken },
    );
    const recipeId = recipe.body.recipe.id;

    // With nothing on hand, the recipe needs 1 missing ingredient.
    let smart = await api.post("/api/smart-selection", { ingredientIds: [ingId] });
    let entry = smart.body.items.find((x: any) => x.recipe.id === recipeId);
    expect(entry).toBeDefined();
    expect(entry.missingCount).toBe(0); // we supplied it

    // Now flip to basic: it becomes always-available; recipe needs 0 non-basics.
    const flip = await api.put(
      `/api/admin/ingredients/${ingId}`,
      { isBasic: true },
      { token: adminToken },
    );
    expect(flip.status).toBe(200);

    // Empty on-hand: recipe with only-basic ingredients is canCookNow.
    smart = await api.post("/api/smart-selection", { ingredientIds: [] });
    entry = smart.body.items.find((x: any) => x.recipe.id === recipeId);
    expect(entry).toBeDefined();
    expect(entry.missingCount).toBe(0);
    expect(entry.canCookNow).toBe(true);

    // Cleanup the recipe so the ingredient can be deleted.
    await api.del(`/api/admin/recipes/${recipeId}`, { token: adminToken });
    await api.del(`/api/admin/ingredients/${ingId}`, { token: adminToken });
  });
});
