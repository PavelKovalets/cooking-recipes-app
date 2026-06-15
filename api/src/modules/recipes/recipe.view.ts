/**
 * Shared recipe read/projection helpers used by catalog, search, discovery,
 * social, moderation and admin. Builds consistent JSON shapes:
 *   - RecipeSummary: list cards (catalog/search/recommendations).
 *   - RecipeDetail:  full detail (ingredients, steps, photos, author, rating,
 *                    comments).
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  categories,
  comments,
  cuisines,
  db,
  ingredients,
  photos,
  recipeCategories,
  recipeIngredients,
  recipes,
  recipeTags,
  steps,
  tags,
  users,
} from "../../db/index.js";

export interface RatingAgg {
  average: number | null;
  count: number;
}

export interface RecipeSummary {
  id: number;
  title: string;
  slug: string;
  description: string;
  status: string;
  authorId: number;
  authorName: string;
  cuisineId: number | null;
  cuisineName: string | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  calories: number | null;
  difficulty: string | null;
  servings: number | null;
  dietary: {
    vegan: boolean;
    vegetarian: boolean;
    glutenFree: boolean;
    lactoseFree: boolean;
  };
  thumbnailUrl: string | null;
  rating: RatingAgg;
  publishedAt: string | null;
  createdAt: string;
}

type RecipeRow = typeof recipes.$inferSelect;

/** Rating aggregate (visible comments with a non-null rating) for a set of recipes. */
async function ratingsFor(recipeIds: number[]): Promise<Map<number, RatingAgg>> {
  const map = new Map<number, RatingAgg>();
  if (recipeIds.length === 0) return map;
  const rows = await db
    .select({
      recipeId: comments.recipeId,
      avg: sql<string>`avg(${comments.rating})`,
      count: sql<string>`count(${comments.rating})`,
    })
    .from(comments)
    .where(
      and(
        inArray(comments.recipeId, recipeIds),
        eq(comments.status, "visible"),
        sql`${comments.rating} is not null`,
      ),
    )
    .groupBy(comments.recipeId);
  for (const r of rows) {
    map.set(r.recipeId, {
      average: r.avg === null ? null : Math.round(Number(r.avg) * 100) / 100,
      count: Number(r.count),
    });
  }
  return map;
}

/** First photo per recipe (lowest position) for list thumbnails. */
async function thumbnailsFor(
  recipeIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (recipeIds.length === 0) return map;
  const rows = await db
    .select({ recipeId: photos.recipeId, url: photos.url, position: photos.position })
    .from(photos)
    .where(inArray(photos.recipeId, recipeIds))
    .orderBy(asc(photos.recipeId), asc(photos.position));
  for (const r of rows) if (!map.has(r.recipeId)) map.set(r.recipeId, r.url);
  return map;
}

/** Build summaries for a list of recipe rows (joins author/cuisine/rating/thumb). */
export async function buildSummaries(
  rows: RecipeRow[],
): Promise<RecipeSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const cuisineIds = [
    ...new Set(rows.map((r) => r.cuisineId).filter((x): x is number => x != null)),
  ];

  const [authorRows, cuisineRows, ratingMap, thumbMap] = await Promise.all([
    db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, authorIds)),
    cuisineIds.length
      ? db
          .select({ id: cuisines.id, name: cuisines.name })
          .from(cuisines)
          .where(inArray(cuisines.id, cuisineIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    ratingsFor(ids),
    thumbnailsFor(ids),
  ]);

  const authorName = new Map(authorRows.map((a) => [a.id, a.displayName]));
  const cuisineName = new Map(cuisineRows.map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    status: r.status,
    authorId: r.authorId,
    authorName: authorName.get(r.authorId) ?? "Unknown",
    cuisineId: r.cuisineId,
    cuisineName: r.cuisineId != null ? cuisineName.get(r.cuisineId) ?? null : null,
    prepTimeMin: r.prepTimeMin,
    cookTimeMin: r.cookTimeMin,
    calories: r.calories,
    difficulty: r.difficulty,
    servings: r.servings,
    dietary: {
      vegan: r.vegan,
      vegetarian: r.vegetarian,
      glutenFree: r.glutenFree,
      lactoseFree: r.lactoseFree,
    },
    thumbnailUrl: thumbMap.get(r.id) ?? null,
    rating: ratingMap.get(r.id) ?? { average: null, count: 0 },
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function buildSummary(row: RecipeRow): Promise<RecipeSummary> {
  const [s] = await buildSummaries([row]);
  return s!;
}

export interface RecipeDetail extends RecipeSummary {
  ingredients: Array<{
    ingredientId: number;
    name: string;
    isBasic: boolean;
    quantity: string | null;
    unit: string | null;
    position: number;
  }>;
  steps: Array<{ position: number; text: string; photoUrl: string | null }>;
  photos: Array<{ id: number; url: string; position: number }>;
  categories: Array<{ id: number; name: string; slug: string }>;
  tags: Array<{ id: number; name: string; slug: string }>;
  comments: Array<{
    id: number;
    userId: number;
    authorName: string;
    rating: number | null;
    body: string;
    status: string;
    createdAt: string;
  }>;
  shareUrl: string;
}

/**
 * Full detail for one recipe. `includeHidden` controls whether hidden comments
 * are returned (admins/owners may want them; public callers do not).
 */
export async function buildDetail(
  row: RecipeRow,
  publicBaseUrl: string,
  opts?: { includeHiddenComments?: boolean },
): Promise<RecipeDetail> {
  const summary = await buildSummary(row);

  const [ingRows, stepRows, photoRows, catRows, tagRows, commentRows] =
    await Promise.all([
      db
        .select({
          ingredientId: recipeIngredients.ingredientId,
          name: ingredients.name,
          isBasic: ingredients.isBasic,
          quantity: recipeIngredients.quantity,
          unit: recipeIngredients.unit,
          position: recipeIngredients.position,
        })
        .from(recipeIngredients)
        .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
        .where(eq(recipeIngredients.recipeId, row.id))
        .orderBy(asc(recipeIngredients.position)),
      db
        .select({
          position: steps.position,
          text: steps.text,
          photoUrl: steps.photoUrl,
        })
        .from(steps)
        .where(eq(steps.recipeId, row.id))
        .orderBy(asc(steps.position)),
      db
        .select({ id: photos.id, url: photos.url, position: photos.position })
        .from(photos)
        .where(eq(photos.recipeId, row.id))
        .orderBy(asc(photos.position)),
      db
        .select({ id: categories.id, name: categories.name, slug: categories.slug })
        .from(recipeCategories)
        .innerJoin(categories, eq(categories.id, recipeCategories.categoryId))
        .where(eq(recipeCategories.recipeId, row.id)),
      db
        .select({ id: tags.id, name: tags.name, slug: tags.slug })
        .from(recipeTags)
        .innerJoin(tags, eq(tags.id, recipeTags.tagId))
        .where(eq(recipeTags.recipeId, row.id)),
      db
        .select({
          id: comments.id,
          userId: comments.userId,
          authorName: users.displayName,
          rating: comments.rating,
          body: comments.body,
          status: comments.status,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.userId))
        .where(
          opts?.includeHiddenComments
            ? eq(comments.recipeId, row.id)
            : and(eq(comments.recipeId, row.id), eq(comments.status, "visible")),
        )
        .orderBy(desc(comments.createdAt)),
    ]);

  return {
    ...summary,
    ingredients: ingRows,
    steps: stepRows,
    photos: photoRows,
    categories: catRows,
    tags: tagRows,
    comments: commentRows.map((c) => ({
      id: c.id,
      userId: c.userId,
      authorName: c.authorName,
      rating: c.rating,
      body: c.body,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    shareUrl: `${publicBaseUrl.replace(/\/+$/, "")}/r/${row.slug}`,
  };
}
