/**
 * Social service: comments + ratings, favorites, cook-status / history,
 * subscriptions. Comment/rating creation fires an in-app notification to the
 * recipe author in the SAME transaction (architecture §6.4).
 */

import { and, desc, eq, sql } from "drizzle-orm";

import {
  comments,
  cookStatus,
  db,
  favorites,
  recipes,
  subscriptions,
  users,
} from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";
import { createNotification } from "../notifications/notification.service.js";

/* -------------------------------------------------------------------------- */
/* Comments + ratings                                                         */
/* -------------------------------------------------------------------------- */

export interface CommentView {
  id: number;
  recipeId: number;
  userId: number;
  authorName: string;
  rating: number | null;
  body: string;
  status: string;
  createdAt: string;
}

async function assertRecipeExists(recipeId: number): Promise<{ authorId: number }> {
  const [row] = await db
    .select({ authorId: recipes.authorId, status: recipes.status })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);
  if (!row) throw ApiError.notFound("Recipe not found.");
  return { authorId: row.authorId };
}

export async function addComment(
  recipeId: number,
  userId: number,
  input: { rating?: number | null; body?: string },
): Promise<CommentView> {
  const { authorId } = await assertRecipeExists(recipeId);
  if ((input.rating == null) && (!input.body || input.body.trim() === "")) {
    throw ApiError.badRequest("A comment must include a rating, a body, or both.");
  }

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(comments)
      .values({
        recipeId,
        userId,
        rating: input.rating ?? null,
        body: input.body ?? "",
        status: "visible",
      })
      .returning();
    if (!row) throw new Error("Failed to create comment");

    // Notify the recipe author (not when commenting on your own recipe). §6.4
    if (authorId !== userId) {
      await createNotification(tx, {
        userId: authorId,
        type: input.rating != null ? "new_rating" : "new_comment",
        payload: {
          recipeId,
          commentId: row.id,
          fromUserId: userId,
          rating: input.rating ?? null,
        },
      });
    }
    return row;
  });

  const [author] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    id: created.id,
    recipeId: created.recipeId,
    userId: created.userId,
    authorName: author?.displayName ?? "Unknown",
    rating: created.rating,
    body: created.body,
    status: created.status,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function listComments(recipeId: number): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: comments.id,
      recipeId: comments.recipeId,
      userId: comments.userId,
      authorName: users.displayName,
      rating: comments.rating,
      body: comments.body,
      status: comments.status,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.recipeId, recipeId), eq(comments.status, "visible")))
    .orderBy(desc(comments.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/* -------------------------------------------------------------------------- */
/* Favorites                                                                  */
/* -------------------------------------------------------------------------- */

export async function addFavorite(userId: number, recipeId: number): Promise<void> {
  await assertRecipeExists(recipeId);
  await db
    .insert(favorites)
    .values({ userId, recipeId })
    .onConflictDoNothing();
}

export async function removeFavorite(userId: number, recipeId: number): Promise<void> {
  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.recipeId, recipeId)));
}

export async function listFavoriteRecipeRows(userId: number) {
  const rows = await db
    .select({ recipe: recipes })
    .from(favorites)
    .innerJoin(recipes, eq(recipes.id, favorites.recipeId))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return rows.map((r) => r.recipe);
}

/* -------------------------------------------------------------------------- */
/* Cook status + history                                                      */
/* -------------------------------------------------------------------------- */

export type CookKind = "cooked" | "want_to_cook";

export async function setCookStatus(
  userId: number,
  recipeId: number,
  status: CookKind,
): Promise<void> {
  await assertRecipeExists(recipeId);
  await db
    .insert(cookStatus)
    .values({ userId, recipeId, status, markedAt: new Date() })
    .onConflictDoUpdate({
      target: [cookStatus.userId, cookStatus.recipeId],
      set: { status, markedAt: new Date(), updatedAt: new Date() },
    });
}

export async function clearCookStatus(userId: number, recipeId: number): Promise<void> {
  await db
    .delete(cookStatus)
    .where(and(eq(cookStatus.userId, userId), eq(cookStatus.recipeId, recipeId)));
}

/** Cooking history = cook_status rows with status=cooked, newest first. */
export async function cookHistoryRows(userId: number) {
  const rows = await db
    .select({ recipe: recipes, markedAt: cookStatus.markedAt })
    .from(cookStatus)
    .innerJoin(recipes, eq(recipes.id, cookStatus.recipeId))
    .where(and(eq(cookStatus.userId, userId), eq(cookStatus.status, "cooked")))
    .orderBy(desc(cookStatus.markedAt));
  return rows;
}

export async function wantToCookRows(userId: number) {
  const rows = await db
    .select({ recipe: recipes, markedAt: cookStatus.markedAt })
    .from(cookStatus)
    .innerJoin(recipes, eq(recipes.id, cookStatus.recipeId))
    .where(and(eq(cookStatus.userId, userId), eq(cookStatus.status, "want_to_cook")))
    .orderBy(desc(cookStatus.markedAt));
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

export async function subscribe(subscriberId: number, authorId: number): Promise<void> {
  if (subscriberId === authorId) {
    throw ApiError.badRequest("You cannot subscribe to yourself.");
  }
  const [author] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);
  if (!author) throw ApiError.notFound("Author not found.");
  await db
    .insert(subscriptions)
    .values({ subscriberId, authorId })
    .onConflictDoNothing();
}

export async function unsubscribe(subscriberId: number, authorId: number): Promise<void> {
  await db
    .delete(subscriptions)
    .where(
      and(
        eq(subscriptions.subscriberId, subscriberId),
        eq(subscriptions.authorId, authorId),
      ),
    );
}

export async function listSubscriptions(subscriberId: number) {
  const rows = await db
    .select({
      authorId: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      since: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.authorId))
    .where(eq(subscriptions.subscriberId, subscriberId))
    .orderBy(desc(subscriptions.createdAt));
  return rows.map((r) => ({ ...r, since: r.since.toISOString() }));
}

export async function recipeFavoriteCount(recipeId: number): Promise<number> {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(favorites)
    .where(eq(favorites.recipeId, recipeId));
  return Number(count);
}
