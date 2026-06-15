/**
 * Application factory. `buildApp()` returns a fully configured Fastify instance
 * WITHOUT calling listen, so tests can use `app.inject()` and server.ts can call
 * listen. (Per the testability requirement.)
 *
 * All API routes are mounted under `/api`. The SPA dev server proxies /api →
 * :3000 and prod serves the SPA same-origin. Media is served at /media; public
 * share pages at /r/:slug.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
import type { BlobStore } from "./platform/storage.js";
import {
  LocalBlobStore,
  MAX_IMAGE_BYTES,
  S3BlobStore,
} from "./platform/storage.js";

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

  // BlobStore: S3-compatible bucket in production, local FS in dev. The local
  // driver also mounts /media so the API can serve the files it writes.
  let blobStore: BlobStore;
  if (env.STORAGE_DRIVER === "s3") {
    blobStore = new S3BlobStore({
      endpoint: env.STORAGE_S3_ENDPOINT!,
      region: env.STORAGE_S3_REGION,
      bucket: env.STORAGE_S3_BUCKET!,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
      publicBaseUrl: env.STORAGE_S3_PUBLIC_BASE_URL!,
    });
  } else {
    const local = new LocalBlobStore(env.STORAGE_LOCAL_DIR, env.PUBLIC_BASE_URL);
    mkdirSync(local.root, { recursive: true });
    await app.register(fastifyStatic, {
      root: local.root,
      prefix: "/media/",
      decorateReply: false,
    });
    blobStore = local;
  }
  app.decorate("blobStore", blobStore);

  // Serve the built SPA (production: the API and SPA share an origin). Skipped in
  // dev, where Vite serves the SPA on :5173 and proxies /api here.
  const here = dirname(fileURLToPath(import.meta.url));
  const spaDir = process.env.WEB_DIST_DIR
    ? resolve(process.env.WEB_DIST_DIR)
    : resolve(here, "../../web/dist");
  const serveSpa = existsSync(join(spaDir, "index.html"));
  if (serveSpa) {
    await app.register(fastifyStatic, {
      root: spaDir,
      prefix: "/",
      wildcard: false,
    });
  }

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
    // SPA history fallback: unknown non-API GET navigations return index.html so
    // client-side routes (e.g. /recipes/123) resolve. Everything else is JSON 404.
    if (
      serveSpa &&
      request.method === "GET" &&
      !request.url.startsWith("/api") &&
      !request.url.startsWith("/media") &&
      (request.headers.accept ?? "").includes("text/html")
    ) {
      return reply.sendFile("index.html");
    }
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
