/**
 * User profile routes (registered): PUT /me, GET/PUT /me/preferences.
 * (GET /me lives in the auth module.)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authGuard, requireAuth } from "../../platform/authz.js";
import { parse } from "../../platform/util.js";
import {
  getPreferences,
  updatePreferences,
  updateProfile,
} from "./user.service.js";

const ProfileBody = z.object({
  displayName: z.string().min(1).max(120).optional(),
  bio: z.string().max(2000).nullish(),
  avatarUrl: z.string().url().max(2000).nullish(),
});

const PreferencesBody = z.object({
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  lactoseFree: z.boolean().optional(),
  allergies: z.array(z.number().int().positive()).max(200).optional(),
  dislikedIngredients: z.array(z.number().int().positive()).max(200).optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.put("/me", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const body = parse(ProfileBody, request.body);
    const user = await updateProfile(p.id, body);
    return { user };
  });

  app.get("/me/preferences", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    return { preferences: await getPreferences(p.id) };
  });

  app.put("/me/preferences", { preHandler: authGuard }, async (request) => {
    const p = requireAuth(request);
    const body = parse(PreferencesBody, request.body);
    const preferences = await updatePreferences(p.id, body);
    return { preferences };
  });
}
