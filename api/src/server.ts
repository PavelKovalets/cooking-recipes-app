/**
 * HTTP entrypoint. Builds the app and starts listening. Env is loaded by the
 * runtime (`tsx --env-file=../.env` in dev; `node --env-file` in prod).
 */

import { buildApp } from "./app.js";
import { env } from "./env.js";

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
