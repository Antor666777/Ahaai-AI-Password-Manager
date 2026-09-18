import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDevDb } from "./dev-client";
import * as schema from "./schema";
import type { Database } from "./types";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No database configured. Set DATABASE_URL, or set AHAALI_ALLOW_EMBEDDED_DB=1 " +
        "for a zero-setup embedded Postgres in development.",
    );
  }

  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    prepare: false,
  });

  return { client, db: drizzle(client, { schema }) };
}

const globalRef = globalThis as typeof globalThis & {
  __ahaaiDb?: ReturnType<typeof createClient>;
};

export function getDb(): Database {
  const dev = getDevDb();
  if (dev) return dev;

  const instance = globalRef.__ahaaiDb ?? createClient();
  globalRef.__ahaaiDb = instance;
  return instance.db;
}
