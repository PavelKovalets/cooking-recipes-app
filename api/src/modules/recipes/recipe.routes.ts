/**
 * Recipe routes:
 *   - Catalog read (guest): GET /recipes (paginated), GET /recipes/:id (detail).
 *   - Authoring (registered): POST/PUT/DELETE /recipes (own only; new → pending),
 *     POST /recipes/:id/photos (multipart upload via BlobStore).
 *   - Owner views: GET /me/recipes.
 *
 * Comments/ratings, favorites, cook-status live in the social module but mount
 * on /recipes/:id paths there.
 */

import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db, recipes } from "../../db/index.js";
import { env } from "../../env.js";
import { assertOwnerOrAdmin, authGuard, requireAuth } from "../../platform/authz.js";
import { ApiError } from "../../platform/errors.js";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "../../platform/storage.js";
import {
  PaginationQuery,
  offset,
  pageResult,
  parse,
} from "../../platform/util.js";
import { buildDetail, buildSummaries } from "./recipe.view.js";
import {
  addPhoto,
  createRecipe,
  deleteRecipe,
  getPublishedRow,
  getRecipeRow,
  listByAuthor,
  updateRecipe,
} from "./recipe.service.js";

const IngredientInput = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.string().max(60).nullish(),
  unit: z.string().max(40).nullish(),
});
const StepInput = z.object({
  text: z.string().min(1),
  photoUrl: z.string().url().max(2000).nullish(),
});

const RecipeBody = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(20000).optional(),
  cuisineId: z.number().int().positive().nullish(),
  prepTimeMin: z.number().int().min(0).max(100000).nullish(),
  cookTimeMin: z.number().int().min(0).max(100000).nullish(),
  calories: z.number().int().min(0).max(100000).nullish(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullish(),
  servings: z.number().int().min(1).max(1000).nullish(),
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  lactoseFree: z.boolean().optional(),
  categoryIds: z.array(z.number().int().positive()).max(20).optional(),
  tagIds: z.array(z.number().int().positive()).max(40).optional(),
  ingredients: z.array(IngredientInput).max(100).optional(),
  steps: z.array(StepInput).max(100).optional(),
});

const RecipeUpdateBody = RecipeBody.partial();

const ListQuery = PaginationQuery.extend({
  authorId: z.coerce.number().int().positive().optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

export async function recipeRoutes(app: FastifyInstance): Promise<void> {
  /* ---- Catalog read (guest) -------------------------------------------- */

  app.get("/recipes", async (request) => {
    const q = parse(ListQuery, request.query);
    const where = q.authorId
      ? and(eq(recipes.status, "published"), eq(recipes.authorId, q.authorId))
      : eq(recipes.status, "published");

    const order =
      q.sort === "oldest"
        ? sql`${recipes.publishedAt} asc nulls last`
        : sql`${recipes.publishedAt} desc nulls last`;

    const rows = await db
      .select()
      .from(recipes)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset(offset(q));

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recipes)
      .where(where);

    const items = await buildSummaries(rows);
    return pageResult(items, Number(count), q);
  });

  // Detail by numeric id OR slug. Guests see published only; owners/admins can
  // see their own non-published recipe (e.g. a pending submission preview).
  app.get("/recipes/:idOrSlug", async (request) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const numeric = /^\d+$/.test(idOrSlug);
    const principal = request.principal;

    let row;
    if (numeric && principal) {
      row = await getRecipeRow(Number(idOrSlug));
      if (row.status !== "published") {
        // Only the author or an admin may view a non-published recipe.
        if (principal.role !== "admin" && principal.id !== row.authorId) {
          throw ApiError.notFound("Recipe not found.");
        }
      }
    } else {
      row = await getPublishedRow(numeric ? Number(idOrSlug) : idOrSlug);
    }

    const isOwnerOrAdmin =
      principal &&
      (principal.role === "admin" || principal.id === row.authorId);
    const detail = await buildDetail(row, env.PUBLIC_BASE_URL, {
      includeHiddenComments: Boolean(isOwnerOrAdmin),
    });
    return { recipe: detail };
  });

  /* ---- Authoring (registered) ------------------------------------------ */

  app.get("/me/recipes", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const rows = await listByAuthor(p.id);
    return { items: await buildSummaries(rows) };
  });

  app.post("/recipes", { preHandler: authGuard }, async (request, reply) => {
    const p = requireAuth(request);
    const body = parse(RecipeBody, request.body);
    // Admins may publish directly; registered users enter the pending queue.
    const row = await createRecipe(p.id, body, {
      asAdmin: p.role === "admin",
      status: p.role === "admin" ? "published" : undefined,
    });
    const detail = await buildDetail(row, env.PUBLIC_BASE_URL, {
      includeHiddenComments: true,
    });
    return reply.code(201).send({ recipe: detail });
  });

  app.put("/recipes/:id", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const { id } = request.params as { id: string };
    const existing = await getRecipeRow(Number(id));
    assertOwnerOrAdmin(p, existing.authorId);
    const body = parse(RecipeUpdateBody, request.body);
    const row = await updateRecipe(Number(id), body);
    const detail = await buildDetail(row, env.PUBLIC_BASE_URL, {
      includeHiddenComments: true,
    });
    return { recipe: detail };
  });

  app.delete("/recipes/:id", { preHandler: authGuard }, async (request, reply) => {
    const p = requireAuth(request);
    const { id } = request.params as { id: string };
    const existing = await getRecipeRow(Number(id));
    assertOwnerOrAdmin(p, existing.authorId);
    await deleteRecipe(Number(id));
    return reply.code(204).send();
  });

  /* ---- Photo upload (multipart → BlobStore) ---------------------------- */

  app.post(
    "/recipes/:id/photos",
    { preHandler: authGuard },
    async (request, reply) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      const existing = await getRecipeRow(Number(id));
      assertOwnerOrAdmin(p, existing.authorId);

      const file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
      if (!file) throw ApiError.badRequest("No file provided (field: file).");

      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        throw ApiError.unsupportedMediaType(
          `Unsupported image type: ${file.mimetype}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
        );
      }

      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw ApiError.payloadTooLarge(
          `Image exceeds the ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB limit.`,
        );
      }

      const stored = await app.blobStore.put(
        `recipes/${id}`,
        buffer,
        file.mimetype,
        file.filename,
      );
      const photo = await addPhoto(Number(id), stored.url);
      return reply.code(201).send({ photo: { ...photo, key: stored.key } });
    },
  );
}
