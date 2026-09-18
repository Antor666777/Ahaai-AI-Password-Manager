import { getDb } from "@ahaai/db/client";
import { bootstrapDevDatabase } from "@ahaai/db/dev-client";
import { runMigrations } from "@ahaai/db/migrate";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDeps } from "./deps";
import { registerStaticFiles } from "./static";

const config = loadConfig(process.env);

if (config.databaseUrl) {
  await runMigrations(config.databaseUrl);
}
await bootstrapDevDatabase();

const deps = createDeps({ config, db: getDb() });
const app = createApp(deps);
const servingStatic = await registerStaticFiles(app, config);

deps.logger.info("ahaai api listening (bun)", {
  port: config.port,
  servingStatic,
});

export default {
  port: config.port,
  fetch: app.fetch,
};
