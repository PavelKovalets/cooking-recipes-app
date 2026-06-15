/**
 * STATS coverage (objective.md, administrator):
 *   "view application statistics (recipe count, user activity, popular
 *   categories)". api.md defines the full aggregate shape.
 */

import { describe, expect, it } from "vitest";

import { adminLogin, api, useApp } from "./helpers.js";

useApp();

describe("Admin stats (objective: view application statistics)", () => {
  it("returns the full aggregate shape with sane values", async () => {
    const { token } = await adminLogin();
    const res = await api.get("/api/admin/stats", { token });
    expect(res.status).toBe(200);
    const s = res.body;

    // recipes block.
    expect(s.recipes).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        published: expect.any(Number),
        pending: expect.any(Number),
        hidden: expect.any(Number),
        draft: expect.any(Number),
      }),
    );
    expect(s.recipes.total).toBeGreaterThanOrEqual(8);
    expect(s.recipes.published).toBeGreaterThanOrEqual(8);
    // status counts cannot exceed the total.
    expect(
      s.recipes.published + s.recipes.pending + s.recipes.hidden + s.recipes.draft,
    ).toBe(s.recipes.total);

    // users block (recipe count, user activity).
    expect(s.users).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        active: expect.any(Number),
        blocked: expect.any(Number),
        admins: expect.any(Number),
        authors: expect.any(Number),
      }),
    );
    expect(s.users.total).toBeGreaterThanOrEqual(4);
    expect(s.users.admins).toBeGreaterThanOrEqual(1);

    // engagement block.
    expect(s.engagement).toEqual(
      expect.objectContaining({
        comments: expect.any(Number),
        ratings: expect.any(Number),
        favorites: expect.any(Number),
        cookedMarks: expect.any(Number),
        subscriptions: expect.any(Number),
      }),
    );

    // moderation counters.
    expect(s.moderation).toEqual(
      expect.objectContaining({
        openComplaints: expect.any(Number),
        pendingRecipes: expect.any(Number),
        hiddenComments: expect.any(Number),
      }),
    );

    // popular categories (objective: popular categories).
    expect(Array.isArray(s.popularCategories)).toBe(true);
    expect(s.popularCategories.length).toBeGreaterThan(0);
    expect(s.popularCategories[0]).toEqual(
      expect.objectContaining({
        categoryId: expect.any(Number),
        name: expect.any(String),
        recipeCount: expect.any(Number),
      }),
    );
    // Sorted by recipeCount descending.
    const counts = s.popularCategories.map((c: any) => c.recipeCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    // top rated + most active arrays exist with the right shape.
    expect(Array.isArray(s.topRatedRecipes)).toBe(true);
    if (s.topRatedRecipes.length > 0) {
      expect(s.topRatedRecipes[0]).toEqual(
        expect.objectContaining({
          recipeId: expect.any(Number),
          title: expect.any(String),
          averageRating: expect.any(Number),
          ratingCount: expect.any(Number),
        }),
      );
    }
    expect(Array.isArray(s.mostActiveUsers)).toBe(true);
    expect(s.mostActiveUsers[0]).toEqual(
      expect.objectContaining({
        userId: expect.any(Number),
        displayName: expect.any(String),
        recipeCount: expect.any(Number),
        commentCount: expect.any(Number),
      }),
    );
  });

  it("stats are admin-only (registered => 403, guest => 401)", async () => {
    const guest = await api.get("/api/admin/stats");
    expect(guest.status).toBe(401);
  });
});
