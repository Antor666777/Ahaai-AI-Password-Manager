import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { EMBEDDED_MIGRATIONS } from "./embedded-migrations";
import { materializeEmbeddedMigrations } from "./migration-files";
import { migrationsFolder } from "./migrations";

describe("embedded migrations", () => {
  it("stays in sync with the drizzle folder", async () => {
    const folder = migrationsFolder();
    const journal = JSON.parse(
      await readFile(join(folder, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };

    expect(EMBEDDED_MIGRATIONS.map((entry) => entry.tag)).toEqual(
      journal.entries.map((entry) => entry.tag),
    );

    for (const migration of EMBEDDED_MIGRATIONS) {
      const sql = await readFile(join(folder, `${migration.tag}.sql`), "utf8");
      expect(migration.sql).toBe(sql);
    }
  });

  it("applies to an empty database and is a no-op afterwards", async () => {
    const client = new PGlite();
    const db = drizzle(client);
    const folder = await materializeEmbeddedMigrations();

    await migrate(db, { migrationsFolder: folder });
    // A second run must be a no-op rather than an error or a duplicate apply.
    await migrate(db, { migrationsFolder: folder });

    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toContain("users");
    expect(names).toContain("items");
    expect(names).toContain("sessions");

    const applied = await client.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations",
    );
    expect(applied.rows[0].count).toBe(EMBEDDED_MIGRATIONS.length);

    await client.close();
  });
});
