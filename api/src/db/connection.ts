/**
 * Shared pg connection configuration.
 *
 * Managed Postgres providers (Neon, Supabase, RDS, …) require TLS, while the
 * local Docker Postgres does not support it. We enable SSL for any non-local
 * host automatically; `sslmode=disable` in the URL forces it off.
 */

import type pg from "pg";

const LOCAL_HOST = /@(localhost|127\.0\.0\.1|\[::1\]|::1)([:/]|$)/;

export function isLocalConnection(connectionString: string): boolean {
  return LOCAL_HOST.test(connectionString);
}

export function pgPoolConfig(connectionString: string): pg.PoolConfig {
  const sslDisabled = /[?&]sslmode=disable\b/.test(connectionString);
  const ssl =
    !sslDisabled && !isLocalConnection(connectionString)
      ? { rejectUnauthorized: true }
      : undefined;
  return { connectionString, ssl };
}
