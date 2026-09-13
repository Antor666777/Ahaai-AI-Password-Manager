import { mkdir } from "node:fs/promises";
import type { Database } from "./types";

const DEV_DATA_DIR = "./.data/ahaai-dev";

/**
 * Zero-setup local database. When DATABASE_URL is absent outside production we
 * run an embedded Postgres (PGlite) so the app boots with `npm run dev` and no
 * external services. When DATABASE_URL is set, this is never touched.
 *
 * The instance is cached on globalThis because the instrumentation hook and the
 * route handlers can load this module as separate instances in one process.
 */
const globalRef = globalThis as typeof globalThis & {
  __ahaaiDevDb?: Database;
  __ahaaiDevBootstrapping?: Promise<void>;
};

export function isDevDatabaseEnabled(): boolean {
  if (process.env.DATABASE_URL) return false;
  // Explicit opt-in wins, because NODE_ENV cannot be trusted here: a shell that
  // exports NODE_ENV=production makes `next dev` run with production while still
  // being a development server.
  if (process.env.AHAALI_ALLOW_EMBEDDED_DB === "1") return true;
  return process.env.NODE_ENV === "development";
}

export function getDevDb(): Database | null {
  return globalRef.__ahaaiDevDb ?? null;
}

export async function bootstrapDevDatabase(): Promise<void> {
  if (!isDevDatabaseEnabled() || globalRef.__ahaaiDevDb) return;
  globalRef.__ahaaiDevBootstrapping ??= bootstrap();
  await globalRef.__ahaaiDevBootstrapping;
}

async function bootstrap(): Promise<void> {
  const [{ PGlite }, { drizzle }, { migrate }, schema] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("./schema"),
  ]);

  await mkdir(DEV_DATA_DIR, { recursive: true });
  const client = new PGlite(DEV_DATA_DIR);
  const instance = drizzle(client, { schema });
  await migrate(instance, { migrationsFolder: "./drizzle" });

  globalRef.__ahaaiDevDb = instance as unknown as Database;
  console.log(
    "[ahaai] using embedded Postgres for development at ./.data/ahaai-dev",
  );
}
