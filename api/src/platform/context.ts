/**
 * App-wide context decorated onto the Fastify instance: the BlobStore and the
 * shared db client. Modules read `app.blobStore`; services import `db` directly.
 */

import type { FastifyInstance } from "fastify";

import type { BlobStore } from "./storage.js";

declare module "fastify" {
  interface FastifyInstance {
    blobStore: BlobStore;
  }
}

export type App = FastifyInstance;
