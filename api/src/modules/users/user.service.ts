/**
 * Users service: own profile + preferences (diets, allergies, disliked
 * ingredients). Admin profile/listing operations live in the moderation module.
 */

import { eq } from "drizzle-orm";

import { db, userPreferences, users } from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";
import { ingredientsExist } from "../catalog/catalog.service.js";
import { toPublicUser } from "../auth/auth.service.js";
import type { PublicUser } from "../auth/auth.service.js";

export interface PreferencesView {
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  lactoseFree: boolean;
  allergies: number[];
  dislikedIngredients: number[];
}

export async function updateProfile(
  userId: number,
  input: { displayName?: string; bio?: string | null; avatarUrl?: string | null },
): Promise<PublicUser> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = input.displayName.trim();
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw ApiError.notFound("User not found.");
  return toPublicUser(row);
}

export async function getPreferences(userId: number): Promise<PreferencesView> {
  let [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (!row) {
    // Lazily create the preferences row for legacy/admin users.
    [row] = await db
      .insert(userPreferences)
      .values({ userId })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      [row] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);
    }
  }
  if (!row) throw ApiError.notFound("Preferences not found.");
  return {
    vegan: row.vegan,
    vegetarian: row.vegetarian,
    glutenFree: row.glutenFree,
    lactoseFree: row.lactoseFree,
    allergies: row.allergies ?? [],
    dislikedIngredients: row.dislikedIngredients ?? [],
  };
}

export async function updatePreferences(
  userId: number,
  input: Partial<PreferencesView>,
): Promise<PreferencesView> {
  if (input.allergies) await ingredientsExist(input.allergies);
  if (input.dislikedIngredients) await ingredientsExist(input.dislikedIngredients);

  // Ensure the row exists, then patch.
  await getPreferences(userId);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.vegan !== undefined) patch.vegan = input.vegan;
  if (input.vegetarian !== undefined) patch.vegetarian = input.vegetarian;
  if (input.glutenFree !== undefined) patch.glutenFree = input.glutenFree;
  if (input.lactoseFree !== undefined) patch.lactoseFree = input.lactoseFree;
  if (input.allergies !== undefined) patch.allergies = input.allergies;
  if (input.dislikedIngredients !== undefined)
    patch.dislikedIngredients = input.dislikedIngredients;

  await db
    .update(userPreferences)
    .set(patch)
    .where(eq(userPreferences.userId, userId));

  return getPreferences(userId);
}
