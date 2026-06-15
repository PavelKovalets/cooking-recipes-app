/**
 * Application factory. `buildApp()` returns a fully configured Fastify instance
 * WITHOUT calling listen, so tests can use `app.inject()` and server.ts can call
 * listen. (Per the testability requirement.)
 *
 * All API routes are mounted under `/api`. The SPA dev server proxies /api →
 * :3000 and prod serves the SPA same-origin. Media is served at /media; public
 * share pages at /r/:slug.
 */

import { mkdirSync } from "node:fs";

import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { env } from "./env.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { discoveryRoutes } from "./modules/discovery/discovery.routes.js";
import { adminRoutes } from "./modules/moderation/admin.routes.js";
import { notificationRoutes } from "./modules/notifications/notification.routes.js";
import { recipeRoutes } from "./modules/recipes/recipe.routes.js";
import {
  shareApiRoutes,
  shareRootRoutes,
} from "./modules/recipes/sharing.routes.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { socialRoutes } from "./modules/social/social.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { resolvePrincipal } from "./platform/authz.js";
import { ApiError } from "./platform/errors.js";
import { MAX_IMAGE_BYTES, LocalBlobStore } from "./platform/storage.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Structured JSON logs (architecture §8). pino-pretty is intentionally not a
    // dependency, so we keep the default JSON transport in every environment.
    logger:
      env.NODE_ENV === "test"
        ? false
        : { level: env.NODE_ENV === "production" ? "info" : "debug" },
    // We validate bodies with zod, not JSON Schema; keep Fastify lenient.
    ajv: { customOptions: { allErrors: true } },
  }).withTypeProvider();

  /* ---- Plugins --------------------------------------------------------- */

  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    credentials: true,
  });

  await app.register(jwt, { secret: env.JWT_SECRET });

  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  });

  // BlobStore (local FS driver in Phase 1). Ensure the dir exists, then mount it.
  const blobStore = new LocalBlobStore(env.STORAGE_LOCAL_DIR, env.PUBLIC_BASE_URL);
  mkdirSync(blobStore.root, { recursive: true });
  app.decorate("blobStore", blobStore);

  await app.register(fastifyStatic, {
    root: blobStore.root,
    prefix: "/media/",
    decorateReply: false,
  });

  /* ---- Principal resolution (runs for every request) ------------------- */
  app.addHook("onRequest", resolvePrincipal);

  /* ---- Consistent error shape ------------------------------------------ */
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "bad_request",
          message: "Validation failed",
          details: {
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        },
      });
    }
    // @fastify/multipart / @fastify/jwt and others set statusCode on the error.
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "Unhandled error");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Internal server error" },
      });
    }
    const err = error as { code?: string; message?: string };
    return reply.code(status).send({
      error: {
        code: err.code ?? "error",
        message: err.message ?? "Request failed",
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: "not_found",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  /* ---- Health probes (root) -------------------------------------------- */
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));

  /* ---- Public share pages (root, not under /api) ----------------------- */
  await app.register(shareRootRoutes);

  /* ---- API routes (all under /api) ------------------------------------- */
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(catalogRoutes);
      await api.register(recipeRoutes);
      await api.register(shareApiRoutes);
      await api.register(searchRoutes);
      await api.register(discoveryRoutes);
      await api.register(socialRoutes);
      await api.register(notificationRoutes);
      await api.register(adminRoutes);
    },
    { prefix: "/api" },
  );

  return app;
}
