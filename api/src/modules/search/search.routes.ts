/**
 * Search route (guest): GET /search — full-text q + faceted filters.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { PaginationQuery, parse } from "../../platform/util.js";
import { search } from "./search.service.js";

const boolish = z
  .union([z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0")])
  .optional()
  .transform((v) => v === "true" || v === "1");

const SearchQuery = PaginationQuery.extend({
  q: z.string().max(300).optional(),
  category: z.coerce.number().int().positive().optional(),
  tag: z.coerce.number().int().positive().optional(),
  cuisine: z.coerce.number().int().positive().optional(),
  // Comma-separated ingredient ids, e.g. ingredients=14,18,20
  ingredients: z.string().optional(),
  maxPrepTime: z.coerce.number().int().min(0).optional(),
  maxCalories: z.coerce.number().int().min(0).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  vegan: boolish,
  vegetarian: boolish,
  glutenFree: boolish,
  lactoseFree: boolish,
});

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/search", async (request) => {
    const q = parse(SearchQuery, request.query);
    const ingredientIds = q.ingredients
      ? q.ingredients
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : undefined;

    return search(
      {
        q: q.q,
        categoryId: q.category,
        tagId: q.tag,
        cuisineId: q.cuisine,
        ingredientIds,
        maxPrepTime: q.maxPrepTime,
        maxCalories: q.maxCalories,
        difficulty: q.difficulty,
        vegan: q.vegan,
        vegetarian: q.vegetarian,
        glutenFree: q.glutenFree,
        lactoseFree: q.lactoseFree,
      },
      { page: q.page, pageSize: q.pageSize },
    );
  });
}
