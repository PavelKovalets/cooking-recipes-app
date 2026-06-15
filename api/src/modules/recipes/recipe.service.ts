/**
 * Recipe authoring + fetch service.
 *
 * Publish workflow (architecture §8): a registered user's new recipe enters
 * status=pending. Admins approve → published (which fires subscriber
 * notifications). Owners may edit/delete their own recipes; admins any.
 *
 * The denormalized `recipes.ingredient_ids` array is trigger-maintained by the
 * DB, so this service never writes it directly — it just manages
 * `recipe_ingredients` rows and the triggers keep the array in sync (§6.2).
 */

import { and, desc, eq, sql } from "drizzle-orm";

import {
  db,
  photos,
  recipeCategories,
  recipeIngredients,
  recipes,
  recipeTags,
  steps,
  subscriptions,
} from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";
import { slugify, uniquifySlug } from "../../platform/util.js";
import {
  categoriesExist,
  ingredientsExist,
  tagsExist,
} from "../catalog/catalog.service.js";
import { createNotification } from "../notifications/notification.service.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface IngredientInput {
  ingredientId: number;
  quantity?: string | null;
  unit?: string | null;
}
export interface StepInput {
  text: string;
  photoUrl?: string | null;
}

export interface RecipeWriteInput {
  title?: string;
  description?: string;
  cuisineId?: number | null;
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  calories?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  servings?: number | null;
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  lactoseFree?: boolean;
  categoryIds?: number[];
  tagIds?: number[];
  ingredients?: IngredientInput[];
  steps?: StepInput[];
}

type RecipeRow = typeof recipes.$inferSelect;

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "recipe";
  const existing = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.slug, base))
    .limit(1);
  return existing.length === 0 ? base : uniquifySlug(base);
}

async function replaceChildren(
  tx: Tx,
  recipeId: number,
  input: RecipeWriteInput,
): Promise<void> {
  if (input.ingredients !== undefined) {
    await tx
      .delete(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));
    if (input.ingredients.length > 0) {
      await tx.insert(recipeIngredients).values(
        input.ingredients.map((ing, idx) => ({
          recipeId,
          ingredientId: ing.ingredientId,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          position: idx,
        })),
      );
    }
  }
  if (input.steps !== undefined) {
    await tx.delete(steps).where(eq(steps.recipeId, recipeId));
    if (input.steps.length > 0) {
      await tx.insert(steps).values(
        input.steps.map((s, idx) => ({
          recipeId,
          position: idx + 1,
          text: s.text,
          photoUrl: s.photoUrl ?? null,
        })),
      );
    }
  }
  if (input.categoryIds !== undefined) {
    await tx
      .delete(recipeCategories)
      .where(eq(recipeCategories.recipeId, recipeId));
    if (input.categoryIds.length > 0) {
      await tx
        .insert(recipeCategories)
        .values(input.categoryIds.map((categoryId) => ({ recipeId, categoryId })));
    }
  }
  if (input.tagIds !== undefined) {
    await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
    if (input.tagIds.length > 0) {
      await tx
        .insert(recipeTags)
        .values(input.tagIds.map((tagId) => ({ recipeId, tagId })));
    }
  }
}

function scalarFields(input: RecipeWriteInput): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (input.title !== undefined) f.title = input.title.trim();
  if (input.description !== undefined) f.description = input.description;
  if (input.cuisineId !== undefined) f.cuisineId = input.cuisineId;
  if (input.prepTimeMin !== undefined) f.prepTimeMin = input.prepTimeMin;
  if (input.cookTimeMin !== undefined) f.cookTimeMin = input.cookTimeMin;
  if (input.calories !== undefined) f.calories = input.calories;
  if (input.difficulty !== undefined) f.difficulty = input.difficulty;
  if (input.servings !== undefined) f.servings = input.servings;
  if (input.vegan !== undefined) f.vegan = input.vegan;
  if (input.vegetarian !== undefined) f.vegetarian = input.vegetarian;
  if (input.glutenFree !== undefined) f.glutenFree = input.glutenFree;
  if (input.lactoseFree !== undefined) f.lactoseFree = input.lactoseFree;
  return f;
}

async function validateRefs(input: RecipeWriteInput): Promise<void> {
  await Promise.all([
    categoriesExist(input.categoryIds ?? []),
    tagsExist(input.tagIds ?? []),
    ingredientsExist((input.ingredients ?? []).map((i) => i.ingredientId)),
  ]);
}

/**
 * Create a recipe. `asAdmin` recipes may be created directly published;
 * registered users' recipes always enter status=pending (publish workflow §8).
 */
export async function createRecipe(
  authorId: number,
  input: RecipeWriteInput,
  opts?: { asAdmin?: boolean; status?: RecipeRow["status"] },
): Promise<RecipeRow> {
  if (!input.title || input.title.trim() === "") {
    throw ApiError.badRequest("A recipe title is required.");
  }
  const title = input.title.trim();
  await validateRefs(input);
  const slug = await uniqueSlug(title);
  const status: RecipeRow["status"] = opts?.asAdmin
    ? (opts.status ?? "published")
    : "pending";

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(recipes)
      .values({
        authorId,
        title,
        slug,
        description: input.description ?? "",
        cuisineId: input.cuisineId ?? null,
        status,
        prepTimeMin: input.prepTimeMin ?? null,
        cookTimeMin: input.cookTimeMin ?? null,
        calories: input.calories ?? null,
        difficulty: input.difficulty ?? null,
        servings: input.servings ?? null,
        vegan: input.vegan ?? false,
        vegetarian: input.vegetarian ?? false,
        glutenFree: input.glutenFree ?? false,
        lactoseFree: input.lactoseFree ?? false,
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning();
    if (!created) throw new Error("Failed to create recipe");
    await replaceChildren(tx, created.id, input);
    if (status === "published") {
      await notifySubscribers(tx, created);
    }
    return created;
  });
}

export async function getRecipeRow(id: number): Promise<RecipeRow> {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Recipe not found.");
  return row;
}

export async function getPublishedRow(idOrSlug: number | string): Promise<RecipeRow> {
  const where =
    typeof idOrSlug === "number"
      ? eq(recipes.id, idOrSlug)
      : eq(recipes.slug, idOrSlug);
  const [row] = await db
    .select()
    .from(recipes)
    .where(and(where, eq(recipes.status, "published")))
    .limit(1);
  if (!row) throw ApiError.notFound("Recipe not found.");
  return row;
}

export async function updateRecipe(
  id: number,
  input: RecipeWriteInput,
): Promise<RecipeRow> {
  await validateRefs(input);
  return db.transaction(async (tx) => {
    const fields = scalarFields(input);
    fields.updatedAt = new Date();
    const [updated] = await tx
      .update(recipes)
      .set(fields)
      .where(eq(recipes.id, id))
      .returning();
    if (!updated) throw ApiError.notFound("Recipe not found.");
    await replaceChildren(tx, id, input);
    return updated;
  });
}

export async function deleteRecipe(id: number): Promise<void> {
  const [row] = await db
    .delete(recipes)
    .where(eq(recipes.id, id))
    .returning({ id: recipes.id });
  if (!row) throw ApiError.notFound("Recipe not found.");
}

/** Add a photo row to a recipe. */
export async function addPhoto(
  recipeId: number,
  url: string,
): Promise<typeof photos.$inferSelect> {
  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(${photos.position}), -1)` })
    .from(photos)
    .where(eq(photos.recipeId, recipeId));
  const position = (maxPos?.max ?? -1) + 1;
  const [row] = await db
    .insert(photos)
    .values({ recipeId, url, position })
    .returning();
  if (!row) throw new Error("Failed to add photo");
  return row;
}

/** List recipes authored by a user (any status). */
export async function listByAuthor(authorId: number): Promise<RecipeRow[]> {
  return db
    .select()
    .from(recipes)
    .where(eq(recipes.authorId, authorId))
    .orderBy(desc(recipes.createdAt));
}

/**
 * Transition a recipe to published, set published_at, and notify subscribers.
 * Idempotent on the notification side only on first publish (published_at unset).
 */
export async function publishRecipe(id: number): Promise<RecipeRow> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(recipes)
      .where(eq(recipes.id, id))
      .limit(1);
    if (!current) throw ApiError.notFound("Recipe not found.");
    const firstPublish = current.publishedAt == null;
    const [updated] = await tx
      .update(recipes)
      .set({
        status: "published",
        publishedAt: current.publishedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();
    if (!updated) throw ApiError.notFound("Recipe not found.");
    if (firstPublish) await notifySubscribers(tx, updated);
    return updated;
  });
}

export async function setRecipeStatus(
  id: number,
  status: RecipeRow["status"],
): Promise<RecipeRow> {
  const [updated] = await db
    .update(recipes)
    .set({ status, updatedAt: new Date() })
    .where(eq(recipes.id, id))
    .returning();
  if (!updated) throw ApiError.notFound("Recipe not found.");
  return updated;
}

/**
 * Notification fan-out on publish (architecture §6.4): one in-app row per
 * subscriber of the author, written in the same transaction as the publish.
 */
async function notifySubscribers(tx: Tx, recipe: RecipeRow): Promise<void> {
  const subs = await tx
    .select({ subscriberId: subscriptions.subscriberId })
    .from(subscriptions)
    .where(eq(subscriptions.authorId, recipe.authorId));
  for (const s of subs) {
    await createNotification(tx, {
      userId: s.subscriberId,
      type: "new_recipe_from_author",
      payload: {
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        recipeSlug: recipe.slug,
        authorId: recipe.authorId,
      },
    });
  }
}

export type { RecipeRow };
