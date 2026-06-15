/**
 * Per-worker test setup. Runs BEFORE any test module (and therefore before the
 * app / db modules, which read process.env at import time) is imported.
 *
 * It loads the repo-root `.env` into process.env with a tiny line parser (no new
 * dependency) and forces NODE_ENV=test so Fastify's logger is silenced.
 *
 * `app.inject()` is used for in-process HTTP, so no PORT/network is needed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// api/test -> repo root is two levels up.
const envPath = resolve(here, "../../.env");

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // No .env? Rely on whatever is already in the ambient environment.
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Do not clobber values already provided by the ambient environment.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(envPath);

// Force a test environment regardless of what the .env file says.
process.env.NODE_ENV = "test";

// Use an isolated storage dir for any media written during tests.
if (!process.env.STORAGE_LOCAL_DIR || process.env.STORAGE_LOCAL_DIR === "./.storage") {
  process.env.STORAGE_LOCAL_DIR = resolve(here, "../.test-storage");
}
