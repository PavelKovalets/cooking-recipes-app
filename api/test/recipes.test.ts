/**
 * RECIPES coverage (objective.md):
 *   Guest: "view recipes and the catalog"; "view recipe details (ingredients,
 *   preparation steps, photos)"; "view recipe ratings and reviews".
 *   Registered: "add recipes (including ingredients, steps, and photos)";
 *   "edit and delete their own recipes"; submission/publish workflow (api.md:
 *   registered → pending, admin approve → published); "share recipes via links".
 *   Cross-cutting: ownership enforced (owner/admin only); unauth protected => 401.
 */

import { describe, expect, it } from "vitest";

import {
  adminLogin,
  api,
  findCuisineByName,
  findCategoryByName,
  findTagByName,
  findIngredientByName,
  getRecipeBySlug,
  registerFreshUser,
  seedUserLogin,
  useApp,
} from "./helpers.js";

useApp();

describe("Catalog listing (objective: guest view recipes & catalog)", () => {
  it("GET /api/recipes returns a page of published RecipeSummary", async () => {
    const res = await api.get("/api/recipes");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
    expect(res.body.total).toBeGreaterThanOrEqual(8);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const r of res.body.items) {
      expect(r.status).toBe("published");
      expect(r).toHaveProperty("rating");
      expect(r).toHaveProperty("dietary");
      expect(r.dietary).toHaveProperty("vegan");
    }
  });

  it("supports pagination via ?page & ?pageSize", async () => {
    const p1 = await api.get("/api/recipes", { query: { page: 1, pageSize: 3 } });
    expect(p1.status).toBe(200);
    expect(p1.body.pageSize).toBe(3);
    expect(p1.body.items.length).toBe(3);
    expect(p1.body.totalPages).toBe(Math.ceil(p1.body.total / 3));

    const p2 = await api.get("/api/recipes", { query: { page: 2, pageSize: 3 } });
    expect(p2.body.page).toBe(2);
    // Pages must not overlap.
    const ids1 = p1.body.items.map((r: any) => r.id);
    const ids2 = p2.body.items.map((r: any) => r.id);
    expect(ids1.some((id: number) => ids2.includes(id))).toBe(false);
  });

  it("supports ?authorId filter and ?sort=oldest|newest", async () => {
    const { user: alice } = await seedUserLogin("alice@example.com");
    const byAuthor = await api.get("/api/recipes", {
      query: { authorId: alice.id },
    });
    expect(byAuthor.status).toBe(200);
    expect(byAuthor.body.items.length).toBeGreaterThan(0);
    expect(byAuthor.body.items.every((r: any) => r.authorId === alice.id)).toBe(true);

    const oldest = await api.get("/api/recipes", { query: { sort: "oldest" } });
    const newest = await api.get("/api/recipes", { query: { sort: "newest" } });
    expect(oldest.status).toBe(200);
    expect(newest.status).toBe(200);
  });
});

describe("Recipe detail + reviews (objective: ingredients/steps/photos + reviews)", () => {
  it("GET /api/recipes/:slug returns full RecipeDetail with children", async () => {
    const recipe = await getRecipeBySlug("spaghetti-carbonara");
    expect(recipe.title).toBe("Spaghetti Carbonara");
    expect(recipe.ingredients.length).toBeGreaterThan(0);
    expect(recipe.steps.length).toBeGreaterThan(0);
    expect(Array.isArray(recipe.photos)).toBe(true);
    expect(recipe.shareUrl).toContain("/r/spaghetti-carbonara");
    // ingredients carry isBasic / quantity / unit
    const first = recipe.ingredients[0];
    expect(first).toHaveProperty("ingredientId");
    expect(first).toHaveProperty("isBasic");
  });

  it("recipe detail exposes ratings & reviews (visible comments + average)", async () => {
    const recipe = await getRecipeBySlug("spaghetti-carbonara");
    // Seed: Bob 5★, Carol 4★ on carbonara => average 4.5, count 2.
    expect(recipe.rating.count).toBe(2);
    expect(recipe.rating.average).toBeCloseTo(4.5, 5);
    expect(recipe.comments.length).toBeGreaterThanOrEqual(2);
    // Only visible comments are exposed to the public.
    expect(recipe.comments.every((c: any) => c.status === "visible")).toBe(true);
  });

  it("GET /api/recipes/:id/comments returns visible reviews only (guest ok)", async () => {
    const recipe = await getRecipeBySlug("spaghetti-carbonara");
    const res = await api.get(`/api/recipes/${recipe.id}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.items.every((c: any) => c.status === "visible")).toBe(true);
  });

  it("unknown slug => 404", async () => {
    const res = await api.get("/api/recipes/does-not-exist-xyz");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("Recipe sharing (objective: share via links / social media)", () => {
  it("GET /api/recipes/:slug/share returns share metadata + Open Graph", async () => {
    const res = await api.get("/api/recipes/spaghetti-carbonara/share");
    expect(res.status).toBe(200);
    expect(res.body.share.url).toContain("/r/spaghetti-carbonara");
    expect(res.body.share.title).toBe("Spaghetti Carbonara");
    expect(res.body.share.openGraph["og:title"]).toBe("Spaghetti Carbonara");
  });

  it("public share page GET /r/:slug serves HTML with OG meta tags", async () => {
    const res = await api.get("/r/spaghetti-carbonara");
    expect(res.status).toBe(200);
    expect(res.raw.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain('property="og:title"');
    expect(res.body).toContain("Spaghetti Carbonara");
  });
});

describe("Authoring: create / edit / delete own recipe (objective: registered)", () => {
  it("registered user authors a recipe => 201 pending; appears in /me/recipes", async () => {
    const { token } = await registerFreshUser("author");
    const cuisine = await findCuisineByName("Italian");
    const category = await findCategoryByName("Main Course");
    const tag = await findTagByName("quick");
    const ing = await findIngredientByName("Tomato");

    const create = await api.post(
      "/api/recipes",
      {
        title: "My Test Pasta",
        description: "A test recipe.",
        cuisineId: cuisine.id,
        prepTimeMin: 5,
        cookTimeMin: 10,
        calories: 400,
        difficulty: "easy",
        servings: 2,
        vegetarian: true,
        categoryIds: [category.id],
        tagIds: [tag.id],
        ingredients: [{ ingredientId: ing.id, quantity: "2", unit: "pcs" }],
        steps: [{ text: "Cook it." }],
      },
      { token },
    );
    expect(create.status).toBe(201);
    // Submission/publish workflow: registered users enter pending.
    expect(create.body.recipe.status).toBe("pending");
    expect(create.body.recipe.ingredients.length).toBe(1);
    expect(create.body.recipe.steps.length).toBe(1);

    const id = create.body.recipe.id;
    const mine = await api.get("/api/me/recipes", { token });
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((r: any) => r.id)).toContain(id);

    // Pending recipe is NOT in the public catalog yet.
    const pub = await api.get("/api/recipes", { query: { pageSize: 100 } });
    expect(pub.body.items.map((r: any) => r.id)).not.toContain(id);

    // But the author can preview their own pending recipe by numeric id.
    const preview = await api.get(`/api/recipes/${id}`, { token });
    expect(preview.status).toBe(200);
    expect(preview.body.recipe.status).toBe("pending");
  });

  it("author can edit their own recipe (child arrays replace)", async () => {
    const { token } = await registerFreshUser("editor");
    const ingA = await findIngredientByName("Tomato");
    const ingB = await findIngredientByName("Basil");
    const create = await api.post(
      "/api/recipes",
      {
        title: "Editable Recipe",
        ingredients: [{ ingredientId: ingA.id }],
        steps: [{ text: "step one" }],
      },
      { token },
    );
    const id = create.body.recipe.id;

    const upd = await api.put(
      `/api/recipes/${id}`,
      {
        title: "Edited Recipe Title",
        ingredients: [{ ingredientId: ingB.id }, { ingredientId: ingA.id }],
      },
      { token },
    );
    expect(upd.status).toBe(200);
    expect(upd.body.recipe.title).toBe("Edited Recipe Title");
    expect(upd.body.recipe.ingredients.length).toBe(2);
    // steps were not provided => unchanged.
    expect(upd.body.recipe.steps.length).toBe(1);
  });

  it("author can delete their own recipe (204), then it is gone", async () => {
    const { token } = await registerFreshUser("deleter");
    const create = await api.post(
      "/api/recipes",
      { title: "Doomed Recipe" },
      { token },
    );
    const id = create.body.recipe.id;
    const del = await api.del(`/api/recipes/${id}`, { token });
    expect(del.status).toBe(204);
    const after = await api.get(`/api/recipes/${id}`, { token });
    expect(after.status).toBe(404);
  });

  it("authoring requires auth: POST /api/recipes without a token => 401", async () => {
    const res = await api.post("/api/recipes", { title: "Nope" });
    expect(res.status).toBe(401);
  });

  it("ownership: a different user cannot edit/delete someone else's recipe => 403", async () => {
    const owner = await registerFreshUser("owner");
    const other = await registerFreshUser("intruder");
    const create = await api.post(
      "/api/recipes",
      { title: "Owner Only Recipe" },
      { token: owner.token },
    );
    const id = create.body.recipe.id;

    const edit = await api.put(
      `/api/recipes/${id}`,
      { title: "Hijacked" },
      { token: other.token },
    );
    expect(edit.status).toBe(403);

    const del = await api.del(`/api/recipes/${id}`, { token: other.token });
    expect(del.status).toBe(403);
  });

  it("rejects unknown child ids on create (validation 400)", async () => {
    const { token } = await registerFreshUser("badref");
    const res = await api.post(
      "/api/recipes",
      { title: "Bad refs", categoryIds: [999999] },
      { token },
    );
    expect(res.status).toBe(400);
  });
});

describe("Photo upload (objective: recipes include photos)", () => {
  it("owner uploads a PNG via multipart field 'file' => 201 with a media url", async () => {
    const { token } = await registerFreshUser("photog");
    const create = await api.post(
      "/api/recipes",
      { title: "Photo Recipe" },
      { token },
    );
    const id = create.body.recipe.id;
    const app = await (await import("./helpers.js")).getApp();

    // Minimal valid PNG (1x1) bytes.
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBytes = Buffer.from(pngBase64, "base64");
    const boundary = "----testboundary1234567890";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pic.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      pngBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: "POST",
      url: `/api/recipes/${id}/photos`,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.photo.url).toContain("/media/");
    expect(body.photo.recipeId).toBe(id);

    // Detail now exposes the photo.
    const detail = await api.get(`/api/recipes/${id}`, { token });
    expect(detail.body.recipe.photos.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a non-image upload with 415 unsupported_media_type", async () => {
    const { token } = await registerFreshUser("badphoto");
    const create = await api.post(
      "/api/recipes",
      { title: "Bad Photo Recipe" },
      { token },
    );
    const id = create.body.recipe.id;
    const app = await (await import("./helpers.js")).getApp();
    const boundary = "----testboundaryTXT";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\n`,
      ),
      Buffer.from("not an image"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: "POST",
      url: `/api/recipes/${id}/photos`,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(415);
  });
});

describe("Admin direct authoring (api.md: admin creates published)", () => {
  it("admin POST /api/recipes creates a published recipe directly", async () => {
    const { token } = await adminLogin();
    const res = await api.post(
      "/api/recipes",
      { title: "Admin Published Recipe" },
      { token },
    );
    expect(res.status).toBe(201);
    expect(res.body.recipe.status).toBe("published");
  });
});
