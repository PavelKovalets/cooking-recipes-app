/**
 * Zod-validated runtime configuration, read once from process.env.
 *
 * Env is loaded by the runtime (`tsx --env-file=../.env` in dev, `node --env-file`
 * in prod) before this module is imported, so we read straight from process.env.
 */

import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    // Optional unpooled connection used only for migrations (pgBouncer/pooled
    // endpoints break Drizzle's migration statements). Falls back to DATABASE_URL.
    DATABASE_URL_DIRECT: z.string().optional(),

    // Media storage. `local` writes to disk + serves via /media (dev); `s3`
    // targets any S3-compatible bucket (Supabase Storage, Cloudflare R2, …).
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./.storage"),
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_REGION: z.string().default("auto"),
    STORAGE_S3_BUCKET: z.string().optional(),
    STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
    // Public base URL objects are served from (e.g. a Supabase public bucket).
    STORAGE_S3_PUBLIC_BASE_URL: z.string().url().optional(),

    PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    // Comma-separated list of allowed CORS origins for the SPA dev server.
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
  })
  .superRefine((val, ctx) => {
    if (val.STORAGE_DRIVER === "s3") {
      const required = [
        "STORAGE_S3_ENDPOINT",
        "STORAGE_S3_BUCKET",
        "STORAGE_S3_ACCESS_KEY_ID",
        "STORAGE_S3_SECRET_ACCESS_KEY",
        "STORAGE_S3_PUBLIC_BASE_URL",
      ] as const;
      for (const key of required) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3`,
          });
        }
      }
    }
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
