/**
 * SOCIAL coverage (objective.md, registered user):
 *   - "add comments and ratings" (rating affects recipe average)
 *   - "save recipes to favorites" (add/remove + list)
 *   - mark recipe statuses ("cooked," "want to cook") + clear
 *   - "maintain a cooking history"
 *   - "subscribe to recipe authors with notifications for new posts"
 *   - "configure profile settings (culinary preferences, allergies, dietary
 *     restrictions)"
 * Cross-cutting: protected routes require auth (401 for guest).
 */

import { describe, expect, it } from "vitest";

import {
  adminLogin,
  api,
  getRecipeBySlug,
  registerFreshUser,
  seedUserLogin,
  useApp,
} from "./helpers.js";

useApp();

describe("Comments & ratings (objective: add comments and ratings)", () => {
  it("a rating updates the recipe's average; pure comments don't add a rating", async () => {
    const author = await registerFreshUser("commentauthor");
    const create = await api.post(
      "/api/recipes",
      { title: "Rate Me Recipe" },
      { token: author.token },
    );
    const id = create.body.recipe.id;
    // Admin publishes so commenters can engage with a normal published recipe.
    const { token: adminToken } = await adminLogin();
    await api.post(`/api/admin/recipes/${id}/approve`, undefined, {
      token: adminToken,
    });

    const rater1 = await registerFreshUser("rater1");
    const rater2 = await registerFreshUser("rater2");

    const c1 = await api.post(
      `/api/recipes/${id}/comments`,
      { rating: 4, body: "Solid." },
      { token: rater1.token },
    );
    expect(c1.status).toBe(201);
    expect(c1.body.comment.rating).toBe(4);

    let detail = await api.get(`/api/recipes/${id}`);
    expect(detail.body.recipe.rating.count).toBe(1);
    expect(detail.body.recipe.rating.average).toBeCloseTo(4, 5);

    await api.post(
      `/api/recipes/${id}/comments`,
      { rating: 2 },
      { token: rater2.token },
    );
    detail = await api.get(`/api/recipes/${id}`);
    // average of [4, 2] = 3, count 2.
    expect(detail.body.recipe.rating.count).toBe(2);
    expect(detail.body.recipe.rating.average).toBeCloseTo(3, 5);

    // A pure comment (no rating) does NOT change the rating count.
    const reader = await registerFreshUser("reader");
    await api.post(
      `/api/recipes/${id}/comments`,
      { body: "Pure comment, no rating." },
      { token: reader.token },
    );
    detail = await api.get(`/api/recipes/${id}`);
    expect(detail.body.recipe.rating.count).toBe(2);
  });

  it("rejects an empty comment (no rating, no body) with 400", async () => {
    const recipe = await getRecipeBySlug("fluffy-pancakes");
    const { token } = await registerFreshUser("emptycomment");
    const res = await api.post(
      `/api/recipes/${recipe.id}/comments`,
      {},
      { token },
    );
    expect(res.status).toBe(400);
  });

  it("posting a comment requires auth (guest => 401)", async () => {
    const recipe = await getRecipeBySlug("fluffy-pancakes");
    const res = await api.post(`/api/recipes/${recipe.id}/comments`, {
      rating: 5,
    });
    expect(res.status).toBe(401);
  });
});

describe("Favorites (objective: save recipes to favorites)", () => {
  it("add, list, and remove a favorite", async () => {
    const { token } = await registerFreshUser("favoriter");
    const recipe = await getRecipeBySlug("greek-salad");

    const add = await api.put(`/api/recipes/${recipe.id}/favorite`, undefined, {
      token,
    });
    expect(add.status).toBe(200);
    expect(add.body.favorited).toBe(true);

    const list = await api.get("/api/me/favorites", { token });
    expect(list.status).toBe(200);
    expect(list.body.items.map((r: any) => r.id)).toContain(recipe.id);

    const remove = await api.del(`/api/recipes/${recipe.id}/favorite`, {
      token,
    });
    expect(remove.status).toBe(200);
    expect(remove.body.favorited).toBe(false);

    const after = await api.get("/api/me/favorites", { token });
    expect(after.body.items.map((r: any) => r.id)).not.toContain(recipe.id);
  });

  it("favorites require auth (guest => 401)", async () => {
    const recipe = await getRecipeBySlug("greek-salad");
    const res = await api.put(`/api/recipes/${recipe.id}/favorite`);
    expect(res.status).toBe(401);
  });
});

describe("Cook status + history (objective: cooked / want to cook + history)", () => {
  it("set cooked => appears in history; set want_to_cook => want-to-cook list; clear removes", async () => {
    const { token } = await registerFreshUser("cooker");
    const cooked = await getRecipeBySlug("chicken-fried-rice");
    const wanted = await getRecipeBySlug("classic-beef-chili");

    const setCooked = await api.put(
      `/api/recipes/${cooked.id}/cook-status`,
      { status: "cooked" },
      { token },
    );
    expect(setCooked.status).toBe(200);
    expect(setCooked.body.status).toBe("cooked");

    const history = await api.get("/api/me/history", { token });
    expect(history.status).toBe(200);
    expect(history.body.items.map((x: any) => x.recipe.id)).toContain(cooked.id);
    expect(history.body.items[0]).toHaveProperty("cookedAt");

    const setWant = await api.put(
      `/api/recipes/${wanted.id}/cook-status`,
      { status: "want_to_cook" },
      { token },
    );
    expect(setWant.body.status).toBe("want_to_cook");

    const wantList = await api.get("/api/me/want-to-cook", { token });
    expect(wantList.body.items.map((x: any) => x.recipe.id)).toContain(wanted.id);
    expect(wantList.body.items[0]).toHaveProperty("markedAt");

    // Switching status is upsert (one row per (user, recipe)).
    await api.put(
      `/api/recipes/${wanted.id}/cook-status`,
      { status: "cooked" },
      { token },
    );
    const wantAfter = await api.get("/api/me/want-to-cook", { token });
    expect(wantAfter.body.items.map((x: any) => x.recipe.id)).not.toContain(
      wanted.id,
    );
    const histAfter = await api.get("/api/me/history", { token });
    expect(histAfter.body.items.map((x: any) => x.recipe.id)).toContain(
      wanted.id,
    );

    // Clear removes the mark entirely.
    const clear = await api.del(`/api/recipes/${cooked.id}/cook-status`, {
      token,
    });
    expect(clear.status).toBe(200);
    expect(clear.body.status).toBeNull();
    const histCleared = await api.get("/api/me/history", { token });
    expect(histCleared.body.items.map((x: any) => x.recipe.id)).not.toContain(
      cooked.id,
    );
  });

  it("cook-status requires auth (guest => 401)", async () => {
    const recipe = await getRecipeBySlug("greek-salad");
    const res = await api.put(`/api/recipes/${recipe.id}/cook-status`, {
      status: "cooked",
    });
    expect(res.status).toBe(401);
  });
});

describe("Subscriptions (objective: subscribe to authors)", () => {
  it("subscribe, list, unsubscribe", async () => {
    const { token } = await registerFreshUser("subscriber");
    const { user: alice } = await seedUserLogin("alice@example.com");

    const sub = await api.post(`/api/subscriptions/${alice.id}`, undefined, {
      token,
    });
    expect(sub.status).toBe(200);
    expect(sub.body.subscribed).toBe(true);

    const list = await api.get("/api/me/subscriptions", { token });
    expect(list.status).toBe(200);
    expect(list.body.items.map((s: any) => s.authorId)).toContain(alice.id);
    expect(list.body.items[0]).toHaveProperty("displayName");
    expect(list.body.items[0]).toHaveProperty("since");

    const unsub = await api.del(`/api/subscriptions/${alice.id}`, { token });
    expect(unsub.status).toBe(200);
    expect(unsub.body.subscribed).toBe(false);

    const after = await api.get("/api/me/subscriptions", { token });
    expect(after.body.items.map((s: any) => s.authorId)).not.toContain(alice.id);
  });

  it("cannot subscribe to yourself (400)", async () => {
    const me = await registerFreshUser("selfsub");
    const res = await api.post(`/api/subscriptions/${me.user.id}`, undefined, {
      token: me.token,
    });
    expect(res.status).toBe(400);
  });
});

describe("Profile & preferences (objective: culinary prefs/allergies/diets)", () => {
  it("PUT /api/me updates the profile", async () => {
    const { token } = await registerFreshUser("profiler");
    const res = await api.put(
      "/api/me",
      { displayName: "Renamed Cook", bio: "I cook things." },
      { token },
    );
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe("Renamed Cook");
    expect(res.body.user.bio).toBe("I cook things.");
  });

  it("GET/PUT /api/me/preferences round-trips diets + allergies + disliked", async () => {
    const { token } = await registerFreshUser("dieter");
    const ingredients = await api.get("/api/ingredients");
    const allergen = ingredients.body.items[0].id;
    const disliked = ingredients.body.items[1].id;

    const initial = await api.get("/api/me/preferences", { token });
    expect(initial.status).toBe(200);
    expect(initial.body.preferences).toMatchObject({
      vegan: false,
      vegetarian: false,
      glutenFree: false,
      lactoseFree: false,
    });

    const upd = await api.put(
      "/api/me/preferences",
      {
        vegan: true,
        glutenFree: true,
        allergies: [allergen],
        dislikedIngredients: [disliked],
      },
      { token },
    );
    expect(upd.status).toBe(200);
    expect(upd.body.preferences.vegan).toBe(true);
    expect(upd.body.preferences.glutenFree).toBe(true);
    expect(upd.body.preferences.allergies).toContain(allergen);
    expect(upd.body.preferences.dislikedIngredients).toContain(disliked);

    const after = await api.get("/api/me/preferences", { token });
    expect(after.body.preferences.vegan).toBe(true);
    expect(after.body.preferences.allergies).toContain(allergen);
  });

  it("preferences require auth (guest => 401)", async () => {
    const res = await api.get("/api/me/preferences");
    expect(res.status).toBe(401);
  });
});
