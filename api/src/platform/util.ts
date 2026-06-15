/**
 * Small shared helpers used across modules.
 */

import { z } from "zod";

import { ApiError } from "./errors.js";

/** URL-safe slug from arbitrary text. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Append a short random suffix to a base slug to keep it unique when the plain
 * slug collides. Kept deterministic-length so it always fits the column.
 */
export function uniquifySlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const trimmed = (base || "item").slice(0, 200);
  return `${trimmed}-${suffix}`;
}

/**
 * Parse + validate with zod, raising a 400 ApiError on failure. Returns the
 * schema's OUTPUT type (so `.default()` / `.transform()` are reflected as
 * non-optional / resolved).
 */
export function parse<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw ApiError.badRequest("Validation failed", {
      issues: r.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return r.data;
}

/** Common pagination query (page is 1-based). */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationQuery>;

export function offset(p: Pagination): number {
  return (p.page - 1) * p.pageSize;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageResult<T>(
  items: T[],
  total: number,
  p: Pagination,
): Page<T> {
  return {
    items,
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Postgres returns bigint columns as strings; coerce to number safely. */
export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number(v ?? 0);
}
