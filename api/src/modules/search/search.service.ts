/**
 * Search & faceted filtering (architecture §6.1).
 *
 * Full-text query against the generated `recipes.search_vector` (GIN-indexed)
 * via `websearch_to_tsquery`; facets become indexed WHERE clauses. Ingredient
 * and tag/category filters are resolved via joins/array overlap. All in
 * PostgreSQL — no external search engine.
 */

import { inArray, sql } from "drizzle-orm";

import { db, recipes } from "../../db/index.js";
import type { Pagination } from "../../platform/util.js";
import { offset, pageResult } from "../../platform/util.js";
import { buildSummaries } from "../recipes/recipe.view.js";

export interface SearchFilters {
  q?: string;
  categoryId?: number;
  tagId?: number;
  cuisineId?: number;
  ingredientIds?: number[];
  maxPrepTime?: number;
  maxCalories?: number;
  difficulty?: "easy" | "medium" | "hard";
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  lactoseFree?: boolean;
}

export async function search(filters: SearchFilters, p: Pagination) {
  const conds: ReturnType<typeof sql>[] = [sql`r.status = 'published'`];

  const hasQuery = !!filters.q && filters.q.trim().length > 0;
  if (hasQuery) {
    conds.push(
      sql`r.search_vector @@ websearch_to_tsquery('english', ${filters.q})`,
    );
  }
  if (filters.categoryId != null) {
    conds.push(
      sql`exists (select 1 from recipe_categories rc where rc.recipe_id = r.id and rc.category_id = ${filters.categoryId})`,
    );
  }
  if (filters.tagId != null) {
    conds.push(
      sql`exists (select 1 from recipe_tags rt where rt.recipe_id = r.id and rt.tag_id = ${filters.tagId})`,
    );
  }
  if (filters.cuisineId != null) {
    conds.push(sql`r.cuisine_id = ${filters.cuisineId}`);
  }
  if (filters.ingredientIds && filters.ingredientIds.length > 0) {
    // Recipes that require ALL of the named (non-basic) ingredients.
    conds.push(
      sql`r.ingredient_ids @> ${sql.raw(`ARRAY[${filters.ingredientIds.map(Number).join(",")}]::bigint[]`)}`,
    );
  }
  if (filters.maxPrepTime != null) {
    conds.push(sql`r.prep_time_min is not null and r.prep_time_min <= ${filters.maxPrepTime}`);
  }
  if (filters.maxCalories != null) {
    conds.push(sql`r.calories is not null and r.calories <= ${filters.maxCalories}`);
  }
  if (filters.difficulty) {
    conds.push(sql`r.difficulty = ${filters.difficulty}`);
  }
  if (filters.vegan) conds.push(sql`r.vegan = true`);
  if (filters.vegetarian) conds.push(sql`r.vegetarian = true`);
  if (filters.glutenFree) conds.push(sql`r.gluten_free = true`);
  if (filters.lactoseFree) conds.push(sql`r.lactose_free = true`);

  const whereSql = sql.join(conds, sql` and `);

  // Ranking: text rank first when querying, else newest first.
  const orderSql = hasQuery
    ? sql`ts_rank(r.search_vector, websearch_to_tsquery('english', ${filters.q})) desc, r.published_at desc nulls last`
    : sql`r.published_at desc nulls last`;

  const idRows = await db.execute<{ id: string }>(sql`
    select r.id from recipes r
    where ${whereSql}
    order by ${orderSql}
    limit ${p.pageSize} offset ${offset(p)}
  `);

  const countRows = await db.execute<{ count: string }>(sql`
    select count(*)::int as count from recipes r where ${whereSql}
  `);
  const total = Number(countRows.rows[0]?.count ?? 0);

  const ids = idRows.rows.map((r) => Number(r.id));
  if (ids.length === 0) return pageResult([], total, p);

  // Fetch full rows preserving the ranked id order.
  const rows = await db.select().from(recipes).where(inArray(recipes.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);

  const items = await buildSummaries(ordered);
  return pageResult(items, total, p);
}
