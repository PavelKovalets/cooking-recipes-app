/**
 * Configured Drizzle client + schema re-export.
 *
 * Import ergonomics for the backend:
 *   import { db, schema } from "../db/index.js";
 *   import { recipes, users } from "../db/index.js"; // schema also flat-exported
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { pgPoolConfig } from "./connection.js";
import * as schema from "./schema.js";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Provide it via the environment (see .env).",
  );
}

/** Shared connection pool. The API tier is stateless; the pool is the only handle. */
export const pool = new Pool(pgPoolConfig(connectionString));

/** Drizzle client bound to the schema, so `db.query.*` relational helpers work. */
export const db = drizzle(pool, { schema });

export type Database = typeof db;

/** Namespaced access to every table/enum/type. */
export { schema };

/** Flat re-export for direct table imports. */
export * from "./schema.js";
