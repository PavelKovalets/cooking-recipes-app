/**
 * Zod-validated runtime configuration, read once from process.env.
 *
 * Env is loaded by the runtime (`tsx --env-file=../.env` in dev, `node --env-file`
 * in prod) before this module is imported, so we read straight from process.env.
 */

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Comma-separated list of allowed CORS origins for the SPA dev server.
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof EnvSchema> & { corsOrigins: string[] };

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const corsOrigins = parsed.data.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...parsed.data, corsOrigins };
}

export const env: Env = load();
