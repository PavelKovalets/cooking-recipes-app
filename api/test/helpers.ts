/**
 * Shared test helpers: a single in-process Fastify app (via buildApp), typed
 * inject wrappers, auth/login helpers, and fixture lookups that read the seeded
 * catalog so tests don't hardcode brittle ids.
 *
 * All HTTP goes through `app.inject()` — no network port is opened.
 */

import { afterAll, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app.js";
import { pool } from "../src/db/index.js";

let appInstance: FastifyInstance | null = null;

/** Lazily build (and reuse) one app for the whole run. */
export async function getApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    appInstance = await buildApp();
    await appInstance.ready();
  }
  return appInstance;
}

export interface Res<T = any> {
  status: number;
  body: T;
  raw: import("light-my-request").Response;
}

interface InjectOpts {
  token?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: InjectOpts["query"]): string {
  if (!query) return path;
  const entries = Object.entries(query).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return path;
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}

async function inject<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: InjectOpts & { payload?: unknown } = {},
): Promise<Res<T>> {
  const app = await getApp();
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await app.inject({
    method,
    url: buildUrl(path, opts.query),
    headers,
    ...(opts.payload !== undefined ? { payload: opts.payload as object } : {}),
  });
  let body: any = undefined;
  const text = res.body;
  if (text && text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text; // non-JSON (e.g. share HTML)
    }
  }
  return { status: res.statusCode, body, raw: res };
}

export const api = {
  get: <T = any>(p: string, o?: InjectOpts) => inject<T>("GET", p, o ?? {}),
  post: <T = any>(p: string, payload?: unknown, o?: InjectOpts) =>
    inject<T>("POST", p, { ...(o ?? {}), payload }),
  put: <T = any>(p: string, payload?: unknown, o?: InjectOpts) =>
    inject<T>("PUT", p, { ...(o ?? {}), payload }),
  del: <T = any>(p: string, o?: InjectOpts) => inject<T>("DELETE", p, o ?? {}),
};

/* ---- Auth helpers ------------------------------------------------------- */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin12345";

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: any }> {
  const res = await api.post("/api/auth/login", { email, password });
  if (res.status !== 200) {
    throw new Error(
      `login(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return { token: res.body.token, user: res.body.user };
}

export async function adminLogin(): Promise<{ token: string; user: any }> {
  return login(ADMIN_EMAIL, ADMIN_PASSWORD);
}

/** Seed users all share password123 (see src/db/seed.ts). */
export async function seedUserLogin(
  email: "alice@example.com" | "bob@example.com" | "carol@example.com",
): Promise<{ token: string; user: any }> {
  return login(email, "password123");
}

let regCounter = 0;
/** Register a fresh user and return token + user. Email is unique per call. */
export async function registerFreshUser(
  prefix = "tester",
): Promise<{ token: string; user: any; email: string; password: string }> {
  regCounter += 1;
  const email = `${prefix}+${Date.now()}-${regCounter}@example.com`;
  const password = "supersecret123";
  const res = await api.post("/api/auth/register", {
    email,
    password,
    displayName: `${prefix} ${regCounter}`,
  });
  if (res.status !== 201) {
    throw new Error(
      `registerFreshUser failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return { token: res.body.token, user: res.body.user, email, password };
}

/* ---- Fixture lookups (read the seeded catalog) -------------------------- */

export async function getRecipeBySlug(slug: string): Promise<any> {
  const res = await api.get(`/api/recipes/${slug}`);
  if (res.status !== 200) {
    throw new Error(`recipe ${slug} not found: ${res.status}`);
  }
  return res.body.recipe;
}

export async function findCategoryByName(name: string): Promise<any> {
  const res = await api.get("/api/categories");
  const found = res.body.items.find((c: any) => c.name === name);
  if (!found) throw new Error(`category ${name} not found`);
  return found;
}

export async function findTagByName(name: string): Promise<any> {
  const res = await api.get("/api/tags");
  const found = res.body.items.find((t: any) => t.name === name);
  if (!found) throw new Error(`tag ${name} not found`);
  return found;
}

export async function findCuisineByName(name: string): Promise<any> {
  const res = await api.get("/api/cuisines");
  const found = res.body.items.find((c: any) => c.name === name);
  if (!found) throw new Error(`cuisine ${name} not found`);
  return found;
}

export async function findIngredientByName(name: string): Promise<any> {
  const res = await api.get("/api/ingredients");
  const found = res.body.items.find((i: any) => i.name === name);
  if (!found) throw new Error(`ingredient ${name} not found`);
  return found;
}

/** Map of ingredient name -> id for the whole catalog. */
export async function ingredientMap(): Promise<Map<string, any>> {
  const res = await api.get("/api/ingredients");
  return new Map(res.body.items.map((i: any) => [i.name, i]));
}

/**
 * Register a `beforeAll`/`afterAll` per file: ensures the app is up and the pg
 * pool is closed exactly once after the LAST file (vitest closes the worker, but
 * we end the pool to avoid open-handle warnings).
 */
export function useApp(): void {
  beforeAll(async () => {
    await getApp();
  });
}

// Close shared resources after the whole worker finishes. Vitest runs all files
// in one fork (see vitest.config.ts), so a process-level cleanup is enough.
afterAll(async () => {
  // No-op per-file; pool teardown handled in the dedicated teardown file.
});

export { pool };
