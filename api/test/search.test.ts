/**
 * SEARCH + FILTERING coverage (objective.md):
 *   Guest: "search for recipes by ingredients, tags, and categories"; "filter
 *   recipes by preparation time, calorie count, difficulty, and dietary
 *   requirements (vegan, vegetarian, gluten-free, lactose-free)".
 * Cross-cutting: the dietary/allergy model is consistent across search.
 */

import { describe, expect, it } from "vitest";

import {
  api,
  findCategoryByName,
  findCuisineByName,
  findIngredientByName,
  findTagByName,
  useApp,
} from "./helpers.js";

useApp();

describe("Full-text search by text (objective: search recipes)", () => {
  it("q matches recipe title/description and ranks results", async () => {
    const res = await api.get("/api/search", { query: { q: "carbonara" } });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].title).toBe("Spaghetti Carbonara");
  });

  it("q with no matches returns an empty page (total 0)", async () => {
    const res = await api.get("/api/search", {
      query: { q: "zzzznotarealdishxyz" },
    });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe("Faceted filtering (objective: filter by category/tag/cuisine)", () => {
  it("filters by category id", async () => {
    const breakfast = await findCategoryByName("Breakfast");
    const res = await api.get("/api/search", {
      query: { category: breakfast.id },
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.map((r: any) => r.title)).toContain("Fluffy Pancakes");
  });

  it("filters by tag id", async () => {
    const quick = await findTagByName("quick");
    const res = await api.get("/api/search", { query: { tag: quick.id } });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("filters by cuisine id", async () => {
    const italian = await findCuisineByName("Italian");
    const res = await api.get("/api/search", { query: { cuisine: italian.id } });
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: any) => r.cuisineId === italian.id)).toBe(true);
  });

  it("filters by required ingredients (must contain ALL)", async () => {
    const beans = await findIngredientByName("Black Beans");
    const res = await api.get("/api/search", {
      query: { ingredients: String(beans.id) },
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    // Black Bean Tacos & Classic Beef Chili both use black beans.
    const titles = res.body.items.map((r: any) => r.title);
    expect(titles).toContain("Black Bean Tacos");
  });
});

describe("Numeric / enum filters (objective: prep time, calories, difficulty)", () => {
  it("maxPrepTime limits results to prep_time_min <= value", async () => {
    const res = await api.get("/api/search", { query: { maxPrepTime: 5 } });
    expect(res.status).toBe(200);
    expect(
      res.body.items.every(
        (r: any) => r.prepTimeMin !== null && r.prepTimeMin <= 5,
      ),
    ).toBe(true);
    // Chocolate Mug Cake has prepTime 5.
    expect(res.body.items.map((r: any) => r.title)).toContain(
      "Chocolate Mug Cake",
    );
  });

  it("maxCalories limits results to calories <= value", async () => {
    const res = await api.get("/api/search", { query: { maxCalories: 300 } });
    expect(res.status).toBe(200);
    expect(
      res.body.items.every((r: any) => r.calories !== null && r.calories <= 300),
    ).toBe(true);
    // Greek Salad is 220 cal.
    expect(res.body.items.map((r: any) => r.title)).toContain("Greek Salad");
  });

  it("difficulty filter narrows to that difficulty", async () => {
    const res = await api.get("/api/search", { query: { difficulty: "hard" } });
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: any) => r.difficulty === "hard")).toBe(true);
  });
});

describe("Dietary filters (objective: vegan/vegetarian/gluten-free/lactose-free)", () => {
  it("vegan=true returns only vegan recipes", async () => {
    const res = await api.get("/api/search", { query: { vegan: "true" } });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((r: any) => r.dietary.vegan === true)).toBe(true);
    // Chickpea Coconut Curry is vegan.
    expect(res.body.items.map((r: any) => r.title)).toContain(
      "Chickpea Coconut Curry",
    );
  });

  it("vegetarian=true returns only vegetarian recipes", async () => {
    const res = await api.get("/api/search", { query: { vegetarian: "true" } });
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: any) => r.dietary.vegetarian === true)).toBe(
      true,
    );
  });

  it("glutenFree=true returns only gluten-free recipes", async () => {
    const res = await api.get("/api/search", { query: { glutenFree: "true" } });
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: any) => r.dietary.glutenFree === true)).toBe(
      true,
    );
  });

  it("lactoseFree=true returns only lactose-free recipes", async () => {
    const res = await api.get("/api/search", { query: { lactoseFree: "true" } });
    expect(res.status).toBe(200);
    expect(
      res.body.items.every((r: any) => r.dietary.lactoseFree === true),
    ).toBe(true);
  });

  it("combined dietary + difficulty filters compose (AND semantics)", async () => {
    const res = await api.get("/api/search", {
      query: { vegan: "true", difficulty: "easy" },
    });
    expect(res.status).toBe(200);
    expect(
      res.body.items.every(
        (r: any) => r.dietary.vegan === true && r.difficulty === "easy",
      ),
    ).toBe(true);
  });
});

describe("Search returns published recipes only", () => {
  it("an empty search (no params) returns the published catalog", async () => {
    const res = await api.get("/api/search");
    expect(res.status).toBe(200);
    expect(res.body.items.every((r: any) => r.status === "published")).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(8);
  });
});
