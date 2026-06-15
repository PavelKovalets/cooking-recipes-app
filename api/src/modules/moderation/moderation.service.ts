/**
 * Moderation service (admin): submission queue, recipe/comment soft-hide,
 * complaints, user blocking + profile views.
 */

import { desc, eq, sql } from "drizzle-orm";

import {
  comments,
  complaints,
  db,
  recipes,
  users,
} from "../../db/index.js";
import { ApiError } from "../../platform/errors.js";

/* ---- Submission queue + recipe moderation ------------------------------ */

/** Recipes awaiting approval (status=pending), oldest first. */
export async function pendingRecipeRows() {
  return db
    .select()
    .from(recipes)
    .where(eq(recipes.status, "pending"))
    .orderBy(desc(recipes.createdAt));
}

/* ---- Comment moderation ------------------------------------------------- */

export async function setCommentStatus(
  id: number,
  status: "visible" | "hidden",
): Promise<void> {
  const [row] = await db
    .update(comments)
    .set({ status, updatedAt: new Date() })
    .where(eq(comments.id, id))
    .returning({ id: comments.id });
  if (!row) throw ApiError.notFound("Comment not found.");
}

export async function deleteComment(id: number): Promise<void> {
  const [row] = await db
    .delete(comments)
    .where(eq(comments.id, id))
    .returning({ id: comments.id });
  if (!row) throw ApiError.notFound("Comment not found.");
}

/* ---- Complaints --------------------------------------------------------- */

export interface ComplaintView {
  id: number;
  reporterId: number;
  reporterName: string;
  targetType: "recipe" | "user" | "comment";
  targetId: number;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
}

export async function fileComplaint(
  reporterId: number,
  input: {
    targetType: "recipe" | "user" | "comment";
    targetId: number;
    reason: string;
  },
): Promise<{ id: number }> {
  // Validate the target exists for the given type.
  await assertTargetExists(input.targetType, input.targetId);
  const [row] = await db
    .insert(complaints)
    .values({
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      status: "open",
    })
    .returning({ id: complaints.id });
  if (!row) throw new Error("Failed to file complaint");
  return { id: row.id };
}

async function assertTargetExists(
  type: "recipe" | "user" | "comment",
  id: number,
): Promise<void> {
  const table = type === "recipe" ? recipes : type === "user" ? users : comments;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!row) throw ApiError.notFound(`Target ${type} not found.`);
}

export async function listComplaints(
  status?: "open" | "resolved",
): Promise<ComplaintView[]> {
  const where = status ? eq(complaints.status, status) : undefined;
  const rows = await db
    .select({
      id: complaints.id,
      reporterId: complaints.reporterId,
      reporterName: users.displayName,
      targetType: complaints.targetType,
      targetId: complaints.targetId,
      reason: complaints.reason,
      status: complaints.status,
      createdAt: complaints.createdAt,
    })
    .from(complaints)
    .innerJoin(users, eq(users.id, complaints.reporterId))
    .where(where)
    .orderBy(desc(complaints.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function resolveComplaint(id: number): Promise<void> {
  const [row] = await db
    .update(complaints)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(eq(complaints.id, id))
    .returning({ id: complaints.id });
  if (!row) throw ApiError.notFound("Complaint not found.");
}

/* ---- Users: list, view profile, block/unblock -------------------------- */

export interface AdminUserView {
  id: number;
  email: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role: "registered" | "admin";
  status: "active" | "blocked";
  recipeCount: number;
  createdAt: string;
}

export async function listUsers(): Promise<AdminUserView[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      recipeCount: sql<number>`(select count(*)::int from recipes r where r.author_id = ${users.id})`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return rows.map((r) => ({
    ...r,
    recipeCount: Number(r.recipeCount),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getUserProfile(id: number): Promise<AdminUserView> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      recipeCount: sql<number>`(select count(*)::int from recipes r where r.author_id = ${users.id})`,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) throw ApiError.notFound("User not found.");
  return {
    ...r,
    recipeCount: Number(r.recipeCount),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function setUserStatus(
  id: number,
  status: "active" | "blocked",
): Promise<void> {
  const [row] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!row) throw ApiError.notFound("User not found.");
}

export async function setUserRole(
  id: number,
  role: "registered" | "admin",
): Promise<void> {
  const [row] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!row) throw ApiError.notFound("User not found.");
}

export async function deleteUser(id: number): Promise<void> {
  const [row] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!row) throw ApiError.notFound("User not found.");
}

/** Admin recipe listing across all statuses, optional status filter. */
export async function listAllRecipeRows(status?: string) {
  if (status) {
    return db
      .select()
      .from(recipes)
      .where(eq(recipes.status, status as typeof recipes.$inferSelect.status))
      .orderBy(desc(recipes.createdAt));
  }
  return db.select().from(recipes).orderBy(desc(recipes.createdAt));
}
