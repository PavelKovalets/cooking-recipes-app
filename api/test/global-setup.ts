/**
 * Vitest global setup: runs ONCE before the whole suite (in the main process).
 *
 * Re-seeds the database so every test file sees the known fixtures
 * (admin@example.com, Alice Baker, "Spaghetti Carbonara", "Fluffy Pancakes",
 * etc.). The seed is idempotent (TRUNCATE ... RESTART IDENTITY CASCADE then
 * insert), so identity columns reset and ids are deterministic across runs.
 *
 * The seed script (`src/db/seed.ts`) reads process.env + calls pool.end() and
 * runs its own `main()` on import, so we run it as a child process via the
 * package script rather than importing it (keeps DB connections isolated from
 * the test workers).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, "..");
const envPath = resolve(apiDir, "../.env");

function envFromFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export default async function setup(): Promise<void> {
  const fileEnv = envFromFile(envPath);
  const childEnv = { ...fileEnv, ...process.env, NODE_ENV: "development" };

  // Run the seed via tsx (the same way `pnpm --filter @app/api seed` does), so
  // the DB is in a known state before any test runs.
  const result = spawnSync(
    "npx",
    ["tsx", "src/db/seed.ts"],
    {
      cwd: apiDir,
      env: childEnv,
      stdio: "inherit",
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Database seed failed (exit ${result.status}). Is Postgres running and migrated?`,
    );
  }
}
