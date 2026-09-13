import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Driver-agnostic database type. Services accept this so they can be exercised
 * against both the production postgres-js client and the in-memory PGlite
 * client used in tests.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
