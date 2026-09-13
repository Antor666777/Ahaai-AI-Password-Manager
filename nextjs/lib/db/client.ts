import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
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

export function getDb(): ReturnType<typeof createClient>["db"] {
  const instance = globalRef.__ahaaiDb ?? createClient();
  globalRef.__ahaaiDb = instance;
  return instance.db;
}
