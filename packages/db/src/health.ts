import { sql } from "drizzle-orm";
import type { Database } from "./types";

/**
 * Cheapest possible round-trip to the database, used by the readiness probe.
 * Resolves when the connection answers and rejects when it does not.
 */
export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
