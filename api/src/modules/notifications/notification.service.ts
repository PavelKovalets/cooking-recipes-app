/**
 * In-app notifications (architecture §6.4, Phase 1).
 *
 * Notification rows are written *synchronously, in the same DB transaction* as
 * the triggering event (a new comment/rating, or a subscribed author publishing
 * a recipe). No worker, no broker, no email in Phase 1. `createNotification`
 * therefore accepts a transaction handle so callers can include it in their unit
 * of work.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { db, notifications } from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

export type NotificationType =
  | "new_comment"
  | "new_rating"
  | "new_recipe_from_author";

export interface NotificationView {
  id: number;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Write a single notification row. Pass a tx to enlist in the caller's txn. */
export async function createNotification(
  exec: DbOrTx,
  input: {
    userId: number;
    type: NotificationType;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await exec.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    payload: input.payload ?? {},
  });
}

export async function listNotifications(
  userId: number,
  opts?: { unreadOnly?: boolean; limit?: number },
): Promise<{ items: NotificationView[]; unreadCount: number }> {
  const where = opts?.unreadOnly
    ? and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`)
    : eq(notifications.userId, userId);

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(opts?.limit ?? 100);

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`),
    );

  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      read: r.readAt != null,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
    unreadCount: Number(count),
  };
}

export async function markRead(userId: number, id: number): Promise<void> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  if (!row) throw ApiError.notFound("Notification not found.");
}

export async function markAllRead(userId: number): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`),
    )
    .returning({ id: notifications.id });
  return rows.length;
}
