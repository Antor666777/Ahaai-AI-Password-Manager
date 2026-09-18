import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrationsDirectory } from "./migration-files";

/**
 * Applies migrations to a real Postgres. Runs once at boot so a fresh container
 * is ready to serve, and a repeat boot is a no-op.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: await migrationsDirectory(),
    });
  } finally {
    await client.end();
  }
}
