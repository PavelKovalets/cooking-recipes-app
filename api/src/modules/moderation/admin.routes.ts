/**
 * Admin surface — all routes namespaced under /admin and guarded by adminGuard
 * (architecture §7, §8). Covers:
 *   - Moderation: submission queue, approve/hide recipes, moderate comments.
 *   - Complaints: list / resolve.
 *   - Taxonomy CRUD: categories, tags, cuisines, ingredients (incl. is_basic).
 *   - Users: list, view profile, block/unblock, role, delete.
 *   - Recipes: admin CRUD across all statuses.
 *   - Stats: GET /admin/stats.
 *
 * Registered-user complaint filing (POST /complaints) is also registered here
 * but guarded only by authGuard.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { env } from "../../env.js";
import { adminGuard, authGuard, requireAuth } from "../../platform/authz.js";
import { parse } from "../../platform/util.js";
import {
  createCategory,
  createCuisine,
  createIngredient,
  createTag,
  deleteCategory,
  deleteCuisine,
  deleteIngredient,
  deleteTag,
  updateCategory,
  updateCuisine,
  updateIngredient,
  updateTag,
} from "../catalog/catalog.service.js";
import {
  createRecipe,
  deleteRecipe,
  getRecipeRow,
  publishRecipe,
  setRecipeStatus,
  updateRecipe,
} from "../recipes/recipe.service.js";
import { buildDetail, buildSummaries } from "../recipes/recipe.view.js";
import { getAdminStats } from "../stats/stats.service.js";
import {
  deleteComment,
  deleteUser,
  fileComplaint,
  getUserProfile,
  listAllRecipeRows,
  listComplaints,
  listUsers,
  pendingRecipeRows,
  resolveComplaint,
  setCommentStatus,
  setUserRole,
  setUserStatus,
} from "./moderation.service.js";

const idParam = (request: { params: unknown }): number =>
  Number((request.params as { id: string }).id);

const NameBody = z.object({ name: z.string().min(1).max(160) });
const CategoryBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
});
const CategoryUpdate = CategoryBody.partial();
const IngredientBody = z.object({
  name: z.string().min(1).max(160),
  isBasic: z.boolean().optional(),
});
const IngredientUpdate = IngredientBody.partial();

const ComplaintBody = z.object({
  targetType: z.enum(["recipe", "user", "comment"]),
  targetId: z.number().int().positive(),
  reason: z.string().min(1).max(2000),
});

const AdminRecipeBody = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(20000).optional(),
  cuisineId: z.number().int().positive().nullish(),
  prepTimeMin: z.number().int().min(0).nullish(),
  cookTimeMin: z.number().int().min(0).nullish(),
  calories: z.number().int().min(0).nullish(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullish(),
  servings: z.number().int().min(1).nullish(),
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  lactoseFree: z.boolean().optional(),
  categoryIds: z.array(z.number().int().positive()).optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
  ingredients: z
    .array(
      z.object({
        ingredientId: z.number().int().positive(),
        quantity: z.string().max(60).nullish(),
        unit: z.string().max(40).nullish(),
      }),
    )
    .optional(),
  steps: z
    .array(z.object({ text: z.string().min(1), photoUrl: z.string().url().nullish() }))
    .optional(),
  status: z.enum(["draft", "pending", "published", "hidden"]).optional(),
});
const AdminRecipeUpdate = AdminRecipeBody.partial();

const RoleBody = z.object({ role: z.enum(["registered", "admin"]) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /* ---- Complaints (file: any registered user) -------------------------- */
  app.post("/complaints", { preHandler: authGuard }, async (request, reply) => {
    const p = requireAuth(request);
    const body = parse(ComplaintBody, request.body);
    const created = await fileComplaint(p.id, body);
    return reply.code(201).send({ complaint: created });
  });

  /* ===================== ADMIN-ONLY (under /admin) ====================== */
  await app.register(
    async (admin) => {
      admin.addHook("preHandler", adminGuard);

      /* ---- Stats ---- */
      admin.get("/stats", async () => getAdminStats());

      /* ---- Submission queue / recipe moderation ---- */
      admin.get("/submissions", async () => {
        const rows = await pendingRecipeRows();
        return { items: await buildSummaries(rows) };
      });

      admin.post("/recipes/:id/approve", async (request) => {
        const row = await publishRecipe(idParam(request));
        return { recipe: await buildSummaries([row]).then((s) => s[0]) };
      });

      admin.post("/recipes/:id/hide", async (request) => {
        const row = await setRecipeStatus(idParam(request), "hidden");
        return { recipe: await buildSummaries([row]).then((s) => s[0]) };
      });

      admin.post("/recipes/:id/unhide", async (request) => {
        const row = await setRecipeStatus(idParam(request), "published");
        return { recipe: await buildSummaries([row]).then((s) => s[0]) };
      });

      /* ---- Admin recipe CRUD (all statuses) ---- */
      admin.get("/recipes", async (request) => {
        const q = request.query as { status?: string };
        const rows = await listAllRecipeRows(q.status);
        return { items: await buildSummaries(rows) };
      });

      admin.get("/recipes/:id", async (request) => {
        const row = await getRecipeRow(idParam(request));
        return {
          recipe: await buildDetail(row, env.PUBLIC_BASE_URL, {
            includeHiddenComments: true,
          }),
        };
      });

      admin.post("/recipes", async (request, reply) => {
        const p = requireAuth(request);
        const body = parse(AdminRecipeBody, request.body);
        const row = await createRecipe(p.id, body, {
          asAdmin: true,
          status: body.status ?? "published",
        });
        return reply.code(201).send({
          recipe: await buildDetail(row, env.PUBLIC_BASE_URL, {
            includeHiddenComments: true,
          }),
        });
      });

      admin.put("/recipes/:id", async (request) => {
        const body = parse(AdminRecipeUpdate, request.body);
        const id = idParam(request);
        await getRecipeRow(id); // 404 if missing
        const row = await updateRecipe(id, body);
        const finalRow =
          body.status !== undefined
            ? await setRecipeStatus(id, body.status)
            : row;
        return {
          recipe: await buildDetail(finalRow, env.PUBLIC_BASE_URL, {
            includeHiddenComments: true,
          }),
        };
      });

      admin.delete("/recipes/:id", async (request, reply) => {
        await deleteRecipe(idParam(request));
        return reply.code(204).send();
      });

      /* ---- Comment moderation ---- */
      admin.post("/comments/:id/hide", async (request) => {
        await setCommentStatus(idParam(request), "hidden");
        return { ok: true };
      });
      admin.post("/comments/:id/unhide", async (request) => {
        await setCommentStatus(idParam(request), "visible");
        return { ok: true };
      });
      admin.delete("/comments/:id", async (request, reply) => {
        await deleteComment(idParam(request));
        return reply.code(204).send();
      });

      /* ---- Complaints ---- */
      admin.get("/complaints", async (request) => {
        const q = request.query as { status?: "open" | "resolved" };
        return { items: await listComplaints(q.status) };
      });
      admin.post("/complaints/:id/resolve", async (request) => {
        await resolveComplaint(idParam(request));
        return { ok: true };
      });

      /* ---- Users ---- */
      admin.get("/users", async () => ({ items: await listUsers() }));
      admin.get("/users/:id", async (request) => ({
        user: await getUserProfile(idParam(request)),
      }));
      admin.post("/users/:id/block", async (request) => {
        await setUserStatus(idParam(request), "blocked");
        return { ok: true, status: "blocked" };
      });
      admin.post("/users/:id/unblock", async (request) => {
        await setUserStatus(idParam(request), "active");
        return { ok: true, status: "active" };
      });
      admin.put("/users/:id/role", async (request) => {
        const body = parse(RoleBody, request.body);
        await setUserRole(idParam(request), body.role);
        return { ok: true, role: body.role };
      });
      admin.delete("/users/:id", async (request, reply) => {
        await deleteUser(idParam(request));
        return reply.code(204).send();
      });

      /* ---- Taxonomy CRUD: categories ---- */
      admin.post("/categories", async (request, reply) => {
        const body = parse(CategoryBody, request.body);
        return reply.code(201).send({ category: await createCategory(body) });
      });
      admin.put("/categories/:id", async (request) => {
        const body = parse(CategoryUpdate, request.body);
        return { category: await updateCategory(idParam(request), body) };
      });
      admin.delete("/categories/:id", async (request, reply) => {
        await deleteCategory(idParam(request));
        return reply.code(204).send();
      });

      /* ---- Taxonomy CRUD: tags ---- */
      admin.post("/tags", async (request, reply) => {
        const body = parse(NameBody, request.body);
        return reply.code(201).send({ tag: await createTag(body) });
      });
      admin.put("/tags/:id", async (request) => {
        const body = parse(NameBody, request.body);
        return { tag: await updateTag(idParam(request), body) };
      });
      admin.delete("/tags/:id", async (request, reply) => {
        await deleteTag(idParam(request));
        return reply.code(204).send();
      });

      /* ---- Taxonomy CRUD: cuisines ---- */
      admin.post("/cuisines", async (request, reply) => {
        const body = parse(NameBody, request.body);
        return reply.code(201).send({ cuisine: await createCuisine(body) });
      });
      admin.put("/cuisines/:id", async (request) => {
        const body = parse(NameBody, request.body);
        return { cuisine: await updateCuisine(idParam(request), body) };
      });
      admin.delete("/cuisines/:id", async (request, reply) => {
        await deleteCuisine(idParam(request));
        return reply.code(204).send();
      });

      /* ---- Taxonomy CRUD: ingredients (incl. is_basic) ---- */
      admin.post("/ingredients", async (request, reply) => {
        const body = parse(IngredientBody, request.body);
        return reply.code(201).send({ ingredient: await createIngredient(body) });
      });
      admin.put("/ingredients/:id", async (request) => {
        const body = parse(IngredientUpdate, request.body);
        return { ingredient: await updateIngredient(idParam(request), body) };
      });
      admin.delete("/ingredients/:id", async (request, reply) => {
        await deleteIngredient(idParam(request));
        return reply.code(204).send();
      });
    },
    { prefix: "/admin" },
  );
}
