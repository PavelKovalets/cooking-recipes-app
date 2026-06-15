/**
 * DISCOVERY coverage (objective.md):
 *   - "use the 'smart selection' feature (input available ingredients to have
 *     the system automatically suggest recipes)"
 *   - "receive personalized recommendations based on cooked and saved recipes"
 * Cross-cutting: the dietary/allergy model is consistent in smart-selection
 * (basics excluded) and recommendations (diet/allergen exclusions).
 */

import { describe, expect, it } from "vitest";

import {
  api,
  getRecipeBySlug,
  ingredientMap,
  registerFreshUser,
  useApp,
} from "./helpers.js";

useApp();

describe("Smart selection (objective: suggest recipes from on-hand ingredients)", () => {
  it("ranks by fewest missing ingredients and flags canCookNow", async () => {
    // Greek Salad non-basic ingredients: Cucumber, Tomato, Lettuce, Lemon
    // (Olive Oil + Salt are basics, excluded from the missing calculation).
    const ings = await ingredientMap();
    const onHand = [
      ings.get("Cucumber")!.id,
      ings.get("Tomato")!.id,
      ings.get("Lettuce")!.id,
      ings.get("Lemon")!.id,
    ];

    const res = await api.post("/api/smart-selection", { ingredientIds: onHand });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);

    const greek = res.body.items.find(
      (x: any) => x.recipe.title === "Greek Salad",
    );
    expect(greek).toBeDefined();
    // We supplied all 4 non-basic ingredients => nothing missing => canCookNow.
    expect(greek.missingCount).toBe(0);
    expect(greek.canCookNow).toBe(true);
    expect(greek.missingIngredientIds).toEqual([]);

    // Results are sorted by ascending missingCount.
    const counts = res.body.items.map((x: any) => x.missingCount);
    const sorted = [...counts].sort((a, b) => a - b);
    expect(counts).toEqual(sorted);
  });

  it("reports the correct missing ingredient set when some are absent", async () => {
    const ings = await ingredientMap();
    // Provide only Cucumber + Tomato of Greek Salad's 4 non-basics.
    const onHand = [ings.get("Cucumber")!.id, ings.get("Tomato")!.id];
    const res = await api.post("/api/smart-selection", { ingredientIds: onHand });
    expect(res.status).toBe(200);

    const greek = res.body.items.find(
      (x: any) => x.recipe.title === "Greek Salad",
    );
    expect(greek).toBeDefined();
    // Lettuce + Lemon are missing.
    expect(greek.missingCount).toBe(2);
    expect(greek.canCookNow).toBe(false);
    expect(greek.missingIngredientIds.sort()).toEqual(
      [ings.get("Lettuce")!.id, ings.get("Lemon")!.id].sort(),
    );
  });

  it("basics-only recipes (no non-basic ingredients) are always cookable", async () => {
    // With an empty on-hand set, any recipe whose ingredient_ids is empty has
    // canCookNow=true. The seed has none, but the contract still ranks recipes
    // sharing at least one on-hand ingredient or needing zero non-basics. Verify
    // an empty input still returns a well-formed (possibly empty) list.
    const res = await api.post("/api/smart-selection", { ingredientIds: [] });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    for (const item of res.body.items) {
      expect(item).toHaveProperty("missingCount");
      expect(item).toHaveProperty("canCookNow");
      expect(item.canCookNow).toBe(item.missingCount === 0);
    }
  });

  it("smart selection is open to guests (objective lists it under registered, api allows guest)", async () => {
    const ings = await ingredientMap();
    const res = await api.post("/api/smart-selection", {
      ingredientIds: [ings.get("Tomato")!.id],
    });
    expect(res.status).toBe(200);
  });

  it("respects the optional limit", async () => {
    const ings = await ingredientMap();
    const res = await api.post("/api/smart-selection", {
      ingredientIds: [ings.get("Tomato")!.id, ings.get("Black Beans")!.id],
      limit: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(1);
  });
});

describe("Recommendations (objective: based on cooked + saved recipes)", () => {
  it("requires auth (guest => 401)", async () => {
    const res = await api.get("/api/recommendations");
    expect(res.status).toBe(401);
  });

  it("returns scored items reflecting the user's cooked/favorited taste profile", async () => {
    const { token } = await registerFreshUser("recs-taste");

    // Engage with a Main Course Italian recipe so the profile leans that way.
    const carbonara = await getRecipeBySlug("spaghetti-carbonara");
    await api.put(`/api/recipes/${carbonara.id}/cook-status`, { status: "cooked" }, { token });
    await api.put(`/api/recipes/${carbonara.id}/favorite`, undefined, { token });

    const res = await api.get("/api/recommendations", { token });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);

    for (const item of res.body.items) {
      expect(item).toHaveProperty("score");
      expect(item.score).toBeGreaterThan(0);
      // Already-engaged recipes are excluded.
      expect(item.recipe.id).not.toBe(carbonara.id);
    }
    // Sorted by descending score.
    const scores = res.body.items.map((x: any) => x.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("excludes recipes that violate the user's diet (vegan => only vegan recs)", async () => {
    const { token } = await registerFreshUser("recs-vegan");
    // Seed a taste profile from a vegan recipe.
    const tacos = await getRecipeBySlug("black-bean-tacos"); // vegan
    await api.put(`/api/recipes/${tacos.id}/cook-status`, { status: "cooked" }, { token });

    // Set vegan preference.
    await api.put("/api/me/preferences", { vegan: true }, { token });

    const res = await api.get("/api/recommendations", { token });
    expect(res.status).toBe(200);
    // Every recommended recipe must be vegan.
    expect(res.body.items.every((x: any) => x.recipe.dietary.vegan === true)).toBe(
      true,
    );
  });

  it("excludes recipes containing an allergen ingredient", async () => {
    const { token } = await registerFreshUser("recs-allergy");
    const ings = await ingredientMap();

    // Build a profile from carbonara (Italian / Main Course).
    const carbonara = await getRecipeBySlug("spaghetti-carbonara");
    await api.put(`/api/recipes/${carbonara.id}/cook-status`, { status: "cooked" }, { token });

    // Declare an allergy to an ingredient used by a candidate recipe (Spinach in
    // Chickpea Coconut Curry); curry must not be recommended.
    const spinach = ings.get("Spinach")!.id;
    await api.put("/api/me/preferences", { allergies: [spinach] }, { token });

    const res = await api.get("/api/recommendations", { token });
    expect(res.status).toBe(200);
    const titles = res.body.items.map((x: any) => x.recipe.title);
    expect(titles).not.toContain("Chickpea Coconut Curry");
  });
});
