import "dotenv/config";
import { serve } from "@hono/node-server";
import { getDb } from "@ahaai/db/client";
import { bootstrapDevDatabase } from "@ahaai/db/dev-client";
import { runMigrations } from "@ahaai/db/migrate";
import { reportRateLimiterBackend } from "@ahaai/core/rate-limit";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDeps } from "./deps";
import { registerStaticFiles } from "./static";

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  if (config.databaseUrl) {
    await runMigrations(config.databaseUrl);
  }
  await bootstrapDevDatabase();

  const deps = createDeps({ config, db: getDb() });
  await reportRateLimiterBackend(deps.logger);
  const app = createApp(deps);
  const servingStatic = await registerStaticFiles(app, config);

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    deps.logger.info("ahaai api listening", {
      port: info.port,
      url: `http://localhost:${info.port}`,
      servingStatic,
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
