import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

export interface TestDb {
  client: PGlite;
  db: PgliteDatabase<typeof schema>;
  close(): Promise<void>;
}

/**
 * Spins up an in-memory Postgres (PGlite) with all migrations applied. No
 * Docker or external service required.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return {
    client,
    db,
    close: () => client.close(),
  };
}
