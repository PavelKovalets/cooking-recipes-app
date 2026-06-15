/**
 * Catalog (taxonomy) service: categories, tags, cuisines, ingredients.
 * Reads are public (guest); writes are admin-only (used by the admin module).
 */

import { asc, eq } from "drizzle-orm";

import {
  categories,
  cuisines,
  db,
  ingredients,
  recipeCategories,
  recipeTags,
  tags,
} from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";
import { slugify } from "../../platform/util.js";

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.name));
}
export async function listTags() {
  return db.select().from(tags).orderBy(asc(tags.name));
}
export async function listCuisines() {
  return db.select().from(cuisines).orderBy(asc(cuisines.name));
}
export async function listIngredients(opts?: { basicOnly?: boolean }) {
  const rows = await db.select().from(ingredients).orderBy(asc(ingredients.name));
  if (opts?.basicOnly) return rows.filter((r) => r.isBasic);
  return rows;
}

/* ---- Admin CRUD: categories -------------------------------------------- */

export async function createCategory(input: {
  name: string;
  description?: string | null;
}) {
  const [row] = await db
    .insert(categories)
    .values({
      name: input.name.trim(),
      slug: slugify(input.name),
      description: input.description ?? null,
    })
    .returning()
    .catch(rethrowUnique("A category with that name/slug already exists."));
  return row;
}
export async function updateCategory(
  id: number,
  input: { name?: string; description?: string | null },
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    patch.name = input.name.trim();
    patch.slug = slugify(input.name);
  }
  if (input.description !== undefined) patch.description = input.description;
  const [row] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, id))
    .returning();
  if (!row) throw ApiError.notFound("Category not found.");
  return row;
}
export async function deleteCategory(id: number): Promise<void> {
  const [row] = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (!row) throw ApiError.notFound("Category not found.");
}

/* ---- Admin CRUD: tags --------------------------------------------------- */

export async function createTag(input: { name: string }) {
  const [row] = await db
    .insert(tags)
    .values({ name: input.name.trim(), slug: slugify(input.name) })
    .returning()
    .catch(rethrowUnique("A tag with that name/slug already exists."));
  return row;
}
export async function updateTag(id: number, input: { name: string }) {
  const [row] = await db
    .update(tags)
    .set({ name: input.name.trim(), slug: slugify(input.name), updatedAt: new Date() })
    .where(eq(tags.id, id))
    .returning();
  if (!row) throw ApiError.notFound("Tag not found.");
  return row;
}
export async function deleteTag(id: number): Promise<void> {
  const [row] = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  if (!row) throw ApiError.notFound("Tag not found.");
}

/* ---- Admin CRUD: cuisines ---------------------------------------------- */

export async function createCuisine(input: { name: string }) {
  const [row] = await db
    .insert(cuisines)
    .values({ name: input.name.trim(), slug: slugify(input.name) })
    .returning()
    .catch(rethrowUnique("A cuisine with that name/slug already exists."));
  return row;
}
export async function updateCuisine(id: number, input: { name: string }) {
  const [row] = await db
    .update(cuisines)
    .set({ name: input.name.trim(), slug: slugify(input.name), updatedAt: new Date() })
    .where(eq(cuisines.id, id))
    .returning();
  if (!row) throw ApiError.notFound("Cuisine not found.");
  return row;
}
export async function deleteCuisine(id: number): Promise<void> {
  const [row] = await db
    .delete(cuisines)
    .where(eq(cuisines.id, id))
    .returning({ id: cuisines.id });
  if (!row) throw ApiError.notFound("Cuisine not found.");
}

/* ---- Admin CRUD: ingredients (incl. is_basic) -------------------------- */

export async function createIngredient(input: {
  name: string;
  isBasic?: boolean;
}) {
  const [row] = await db
    .insert(ingredients)
    .values({
      name: input.name.trim(),
      slug: slugify(input.name),
      isBasic: input.isBasic ?? false,
    })
    .returning()
    .catch(rethrowUnique("An ingredient with that name/slug already exists."));
  return row;
}
export async function updateIngredient(
  id: number,
  input: { name?: string; isBasic?: boolean },
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    patch.name = input.name.trim();
    patch.slug = slugify(input.name);
  }
  if (input.isBasic !== undefined) patch.isBasic = input.isBasic;
  const [row] = await db
    .update(ingredients)
    .set(patch)
    .where(eq(ingredients.id, id))
    .returning();
  if (!row) throw ApiError.notFound("Ingredient not found.");
  return row;
}
export async function deleteIngredient(id: number): Promise<void> {
  // recipe_ingredients.ingredient_id is ON DELETE RESTRICT — surface a 409.
  try {
    const [row] = await db
      .delete(ingredients)
      .where(eq(ingredients.id, id))
      .returning({ id: ingredients.id });
    if (!row) throw ApiError.notFound("Ingredient not found.");
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.conflict(
      "Ingredient is in use by one or more recipes and cannot be deleted.",
    );
  }
}

/** Map Postgres unique-violation (23505) to a friendly 409. */
function rethrowUnique(message: string) {
  return (err: unknown): never => {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw ApiError.conflict(message);
    }
    throw err;
  };
}

/** Validate that ids exist; used by recipe authoring. */
export async function categoriesExist(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db.select({ id: categories.id }).from(categories);
  const set = new Set(rows.map((r) => r.id));
  for (const id of ids)
    if (!set.has(id)) throw ApiError.badRequest(`Unknown category id: ${id}`);
}
export async function tagsExist(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db.select({ id: tags.id }).from(tags);
  const set = new Set(rows.map((r) => r.id));
  for (const id of ids)
    if (!set.has(id)) throw ApiError.badRequest(`Unknown tag id: ${id}`);
}
export async function ingredientsExist(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db.select({ id: ingredients.id }).from(ingredients);
  const set = new Set(rows.map((r) => r.id));
  for (const id of ids)
    if (!set.has(id))
      throw ApiError.badRequest(`Unknown ingredient id: ${id}`);
}

export { recipeCategories, recipeTags };
