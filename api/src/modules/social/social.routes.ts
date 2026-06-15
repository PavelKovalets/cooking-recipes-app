/**
 * Social routes (registered):
 *   - Comments + ratings: POST /recipes/:id/comments, GET /recipes/:id/comments (public)
 *   - Favorites: PUT/DELETE /recipes/:id/favorite, GET /me/favorites
 *   - Cook status: PUT/DELETE /recipes/:id/cook-status, GET /me/history, GET /me/want-to-cook
 *   - Subscriptions: POST/DELETE /subscriptions/:authorId, GET /me/subscriptions
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authGuard, requireAuth } from "../../platform/authz.js";
import { parse } from "../../platform/util.js";
import { buildSummaries } from "../recipes/recipe.view.js";
import {
  addComment,
  addFavorite,
  clearCookStatus,
  cookHistoryRows,
  listComments,
  listFavoriteRecipeRows,
  listSubscriptions,
  removeFavorite,
  setCookStatus,
  subscribe,
  unsubscribe,
  wantToCookRows,
} from "./social.service.js";

const CommentBody = z
  .object({
    rating: z.number().int().min(1).max(5).nullish(),
    body: z.string().max(5000).optional(),
  })
  .refine((v) => v.rating != null || (v.body && v.body.trim() !== ""), {
    message: "Provide a rating, a body, or both.",
  });

const CookStatusBody = z.object({
  status: z.enum(["cooked", "want_to_cook"]),
});

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  /* ---- Comments + ratings ---------------------------------------------- */

  app.get("/recipes/:id/comments", async (request) => {
    const { id } = request.params as { id: string };
    return { items: await listComments(Number(id)) };
  });

  app.post(
    "/recipes/:id/comments",
    { preHandler: authGuard },
    async (request, reply) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      const body = parse(CommentBody, request.body);
      const comment = await addComment(Number(id), p.id, {
        rating: body.rating ?? null,
        body: body.body ?? "",
      });
      return reply.code(201).send({ comment });
    },
  );

  /* ---- Favorites ------------------------------------------------------- */

  app.put(
    "/recipes/:id/favorite",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      await addFavorite(p.id, Number(id));
      return { ok: true, favorited: true };
    },
  );

  app.delete(
    "/recipes/:id/favorite",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      await removeFavorite(p.id, Number(id));
      return { ok: true, favorited: false };
    },
  );

  app.get("/me/favorites", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const rows = await listFavoriteRecipeRows(p.id);
    return { items: await buildSummaries(rows) };
  });

  /* ---- Cook status + history ------------------------------------------- */

  app.put(
    "/recipes/:id/cook-status",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      const body = parse(CookStatusBody, request.body);
      await setCookStatus(p.id, Number(id), body.status);
      return { ok: true, status: body.status };
    },
  );

  app.delete(
    "/recipes/:id/cook-status",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { id } = request.params as { id: string };
      await clearCookStatus(p.id, Number(id));
      return { ok: true, status: null };
    },
  );

  app.get("/me/history", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const rows = await cookHistoryRows(p.id);
    const summaries = await buildSummaries(rows.map((r) => r.recipe));
    const byId = new Map(summaries.map((s) => [s.id, s]));
    return {
      items: rows
        .map((r) => {
          const recipe = byId.get(r.recipe.id);
          return recipe ? { recipe, cookedAt: r.markedAt.toISOString() } : null;
        })
        .filter((x): x is { recipe: (typeof summaries)[number]; cookedAt: string } => x !== null),
    };
  });

  app.get("/me/want-to-cook", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const rows = await wantToCookRows(p.id);
    const summaries = await buildSummaries(rows.map((r) => r.recipe));
    const byId = new Map(summaries.map((s) => [s.id, s]));
    return {
      items: rows
        .map((r) => {
          const recipe = byId.get(r.recipe.id);
          return recipe ? { recipe, markedAt: r.markedAt.toISOString() } : null;
        })
        .filter((x): x is { recipe: (typeof summaries)[number]; markedAt: string } => x !== null),
    };
  });

  /* ---- Subscriptions --------------------------------------------------- */

  app.post(
    "/subscriptions/:authorId",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { authorId } = request.params as { authorId: string };
      await subscribe(p.id, Number(authorId));
      return { ok: true, subscribed: true };
    },
  );

  app.delete(
    "/subscriptions/:authorId",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const { authorId } = request.params as { authorId: string };
      await unsubscribe(p.id, Number(authorId));
      return { ok: true, subscribed: false };
    },
  );

  app.get("/me/subscriptions", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    return { items: await listSubscriptions(p.id) };
  });
}
