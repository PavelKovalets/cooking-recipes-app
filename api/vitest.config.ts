/**
 * Vitest configuration for the API integration/e2e suite.
 *
 * - `globalSetup` re-seeds the database once before the whole run so fixtures are
 *   known and deterministic (idempotent truncate-then-insert).
 * - `setupFiles` runs in EACH test worker BEFORE any test module is imported; it
 *   loads the repo-root `.env` into process.env so `env.ts` / `db/index.ts`
 *   (which read process.env at import time) see valid config.
 * - Tests run in a single fork (no parallelism across files) so additive writes
 *   from one file cannot race the global counts another file asserts on.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Run all test files in one process, sequentially, against the shared DB.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
