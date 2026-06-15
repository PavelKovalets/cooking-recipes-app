/**
 * Idempotent production bootstrap. Safe to run on every deploy: it ensures the
 * admin account exists and never touches existing data (unlike the destructive
 * `seed.ts`, which is for local/dev fixtures only).
 *
 * Run via:  pnpm --filter @app/api bootstrap
 * (package.json wires this to: tsx --env-file=../.env src/db/bootstrap.ts)
 * In production the compiled form runs: node api/dist/db/bootstrap.js
 */

import argon2 from "argon2";
import { eq } from "drizzle-orm";

import { db, pool, userPreferences, users } from "./index.js";

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Admin already exists: ${email} (id=${existing[0]!.id})`);
  } else {
    const passwordHash = await argon2.hash(password);
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        displayName: "Site Admin",
        role: "admin",
        status: "active",
      })
      .returning({ id: users.id });
    if (!created) throw new Error("bootstrap: failed to create admin user");
    await db.insert(userPreferences).values({ userId: created.id });
    console.log(`Created admin: ${email} (id=${created.id})`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("Bootstrap failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
