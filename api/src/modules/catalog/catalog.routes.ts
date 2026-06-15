/**
 * Public catalog reads (guest): categories, tags, cuisines, ingredients.
 */

import type { FastifyInstance } from "fastify";

import {
  listCategories,
  listCuisines,
  listIngredients,
  listTags,
} from "./catalog.service.js";

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/categories", async () => ({ items: await listCategories() }));
  app.get("/tags", async () => ({ items: await listTags() }));
  app.get("/cuisines", async () => ({ items: await listCuisines() }));
  app.get("/ingredients", async (request) => {
    const q = request.query as { basic?: string };
    const basicOnly = q.basic === "true" || q.basic === "1";
    return { items: await listIngredients({ basicOnly }) };
  });
}
