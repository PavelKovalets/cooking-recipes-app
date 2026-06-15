/**
 * Programmatic migrator. Applies every SQL migration in ./drizzle in order.
 *
 * Run via:  pnpm --filter @app/api migrate
 * (package.json wires this to: tsx --env-file=../.env src/db/migrate.ts)
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Provide it via the environment.");
  }

  const here = dirname(fileURLToPath(import.meta.url));
  // ./drizzle lives at the api workspace root: src/db -> ../../drizzle
  const migrationsFolder = resolve(here, "../../drizzle");

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log(`Applying migrations from ${migrationsFolder} ...`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully.");

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
