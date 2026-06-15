/**
 * Discovery routes:
 *   - POST /smart-selection (guest ok): ingredient ids on hand → ranked recipes.
 *   - GET  /recommendations (registered): content-based personalized recs.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authGuard, requireAuth } from "../../platform/authz.js";
import { parse } from "../../platform/util.js";
import { recommendations, smartSelection } from "./discovery.service.js";

const SmartSelectionBody = z.object({
  ingredientIds: z.array(z.number().int().positive()).max(200).default([]),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function discoveryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/smart-selection", async (request) => {
    const body = parse(SmartSelectionBody, request.body);
    const results = await smartSelection(body.ingredientIds, body.limit ?? 30);
    return { items: results };
  });

  app.get(
    "/recommendations",
    { preHandler: authGuard },
    async (request) => {
      const p = requireAuth(request);
      const q = request.query as { limit?: string };
      const limit = q.limit ? Math.min(100, Math.max(1, Number(q.limit))) : 20;
      const results = await recommendations(p.id, limit);
      return { items: results };
    },
  );
}
