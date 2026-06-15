/**
 * Discovery: smart selection + personalized recommendations (architecture §6.2, §6.3).
 *
 * Both are pure PostgreSQL / application logic over the existing schema — no
 * search cluster, no ML service.
 */

import { eq, inArray, sql } from "drizzle-orm";

import {
  db,
  recipes,
  userPreferences,
} from "../../db/index.js";
import type { RecipeSummary } from "../recipes/recipe.view.js";
import { buildSummaries } from "../recipes/recipe.view.js";

/* -------------------------------------------------------------------------- */
/* Smart selection                                                            */
/* -------------------------------------------------------------------------- */

export interface SmartSelectionResult {
  recipe: RecipeSummary;
  missingCount: number;
  missingIngredientIds: number[];
  canCookNow: boolean;
}

/**
 * Given the NON-basic ingredient ids the user has on hand, rank published
 * recipes by fewest missing required (non-basic) ingredients, then by rating.
 *
 * Basics (`is_basic = true`) are excluded from recipes.ingredient_ids by
 * construction (the trigger stores non-basic ids only, §6.2), so "missing" =
 * required-non-basic minus on-hand. Recipes that need zero non-basic
 * ingredients (ingredient_ids = '{}') are always cookable.
 */
export async function smartSelection(
  onHand: number[],
  limit = 30,
): Promise<SmartSelectionResult[]> {
  const onHandArr = sql.raw(
    `ARRAY[${onHand.map(Number).join(",")}]::bigint[]`,
  );
  const onHandExpr = onHand.length > 0 ? onHandArr : sql.raw(`'{}'::bigint[]`);

  // Compute missing set + count in SQL; rank fewest-missing first then rating.
  const rows = await db.execute<{
    id: string;
    missing_count: string;
    missing_ids: string[] | null;
  }>(sql`
    with on_hand as (select ${onHandExpr} as ids)
    select
      r.id,
      cardinality(
        array(select unnest(r.ingredient_ids) except select unnest(oh.ids))
      ) as missing_count,
      array(select unnest(r.ingredient_ids) except select unnest(oh.ids)) as missing_ids
    from recipes r cross join on_hand oh
    where r.status = 'published'
      and (
        cardinality(r.ingredient_ids) = 0
        or r.ingredient_ids && oh.ids
      )
    order by missing_count asc,
      (
        select coalesce(avg(c.rating), 0)
        from comments c
        where c.recipe_id = r.id and c.status = 'visible' and c.rating is not null
      ) desc,
      r.published_at desc nulls last
    limit ${limit}
  `);

  const ids = rows.rows.map((r) => Number(r.id));
  if (ids.length === 0) return [];

  const recipeRows = await db.select().from(recipes).where(inArray(recipes.id, ids));
  const byId = new Map(recipeRows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const summaries = await buildSummaries(ordered);
  const summaryById = new Map(summaries.map((s) => [s.id, s]));

  return rows.rows
    .map((r) => {
      const id = Number(r.id);
      const summary = summaryById.get(id);
      if (!summary) return null;
      const missingIngredientIds = (r.missing_ids ?? []).map(Number);
      const missingCount = Number(r.missing_count);
      return {
        recipe: summary,
        missingCount,
        missingIngredientIds,
        canCookNow: missingCount === 0,
      };
    })
    .filter((x): x is SmartSelectionResult => x !== null);
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

export interface RecommendationResult {
  recipe: RecipeSummary;
  score: number;
}

/**
 * Content-based, deterministic recommendations (§6.3).
 *
 * 1. Build a taste profile from the user's cooked + favorited recipes: weighted
 *    frequency of their categories, tags, and cuisines.
 * 2. Score every other published recipe by overlap with that profile.
 * 3. Exclude recipes the user already cooked/favorited and recipes that violate
 *    the user's diet preferences (and contain disliked/allergen ingredients).
 * 4. Rank by score then rating.
 */
export async function recommendations(
  userId: number,
  limit = 20,
): Promise<RecommendationResult[]> {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const allergens = prefs?.allergies ?? [];
  const disliked = prefs?.dislikedIngredients ?? [];
  const excludedIngredients = [...new Set([...allergens, ...disliked])].map(Number);
  const excludedArr =
    excludedIngredients.length > 0
      ? sql.raw(`ARRAY[${excludedIngredients.join(",")}]::bigint[]`)
      : sql.raw(`'{}'::bigint[]`);

  // Diet exclusions: if the user is vegan, only show vegan recipes, etc.
  const dietConds: ReturnType<typeof sql>[] = [];
  if (prefs?.vegan) dietConds.push(sql`r.vegan = true`);
  if (prefs?.vegetarian) dietConds.push(sql`r.vegetarian = true`);
  if (prefs?.glutenFree) dietConds.push(sql`r.gluten_free = true`);
  if (prefs?.lactoseFree) dietConds.push(sql`r.lactose_free = true`);
  const dietSql =
    dietConds.length > 0 ? sql.join([sql`and`, sql.join(dietConds, sql` and `)], sql` `) : sql``;

  const rows = await db.execute<{ id: string; score: string }>(sql`
    with seed as (
      -- recipes the user has engaged with (cooked or favorited)
      select recipe_id from cook_status where user_id = ${userId} and status = 'cooked'
      union
      select recipe_id from favorites where user_id = ${userId}
    ),
    profile_categories as (
      select rc.category_id as id, count(*)::float as w
      from seed s join recipe_categories rc on rc.recipe_id = s.recipe_id
      group by rc.category_id
    ),
    profile_tags as (
      select rt.tag_id as id, count(*)::float as w
      from seed s join recipe_tags rt on rt.recipe_id = s.recipe_id
      group by rt.tag_id
    ),
    profile_cuisines as (
      select r0.cuisine_id as id, count(*)::float as w
      from seed s join recipes r0 on r0.id = s.recipe_id
      where r0.cuisine_id is not null
      group by r0.cuisine_id
    ),
    scored as (
      select r.id,
        (
          coalesce((select sum(pc.w) from recipe_categories rc
                    join profile_categories pc on pc.id = rc.category_id
                    where rc.recipe_id = r.id), 0)
          + coalesce((select sum(pt.w) from recipe_tags rt
                      join profile_tags pt on pt.id = rt.tag_id
                      where rt.recipe_id = r.id), 0)
          + coalesce((select pcu.w * 1.5 from profile_cuisines pcu
                      where pcu.id = r.cuisine_id), 0)
        ) as score,
        coalesce((select avg(c.rating) from comments c
                  where c.recipe_id = r.id and c.status = 'visible'
                  and c.rating is not null), 0) as rating,
        r.published_at
      from recipes r
      where r.status = 'published'
        and r.id not in (select recipe_id from seed)
        and not (r.ingredient_ids && ${excludedArr})
        ${dietSql}
    )
    select id, score from scored
    where score > 0
    order by score desc, rating desc, published_at desc nulls last
    limit ${limit}
  `);

  const ids = rows.rows.map((r) => Number(r.id));
  if (ids.length === 0) return [];
  const recipeRows = await db.select().from(recipes).where(inArray(recipes.id, ids));
  const byId = new Map(recipeRows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const summaries = await buildSummaries(ordered);
  const summaryById = new Map(summaries.map((s) => [s.id, s]));

  return rows.rows
    .map((r) => {
      const summary = summaryById.get(Number(r.id));
      if (!summary) return null;
      return { recipe: summary, score: Math.round(Number(r.score) * 100) / 100 };
    })
    .filter((x): x is RecommendationResult => x !== null);
}
