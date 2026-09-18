import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMBEDDED_JOURNAL, EMBEDDED_MIGRATIONS } from "./embedded-migrations";
import { migrationsFolder } from "./migrations";

/**
 * Writes the inlined migrations to a temporary folder, because the Drizzle
 * migrator reads from disk rather than accepting migrations in memory.
 *
 * The folder name is content addressed, so repeated boots reuse one folder and
 * concurrent boots cannot collide.
 */
export async function materializeEmbeddedMigrations(): Promise<string> {
  const fingerprint = createHash("sha256")
    .update(
      EMBEDDED_MIGRATIONS.map((entry) => `${entry.tag}\u0000${entry.sql}`).join(
        "\u0001",
      ),
    )
    .digest("hex")
    .slice(0, 16);

  const folder = join(tmpdir(), `ahaai-migrations-${fingerprint}`);
  await mkdir(join(folder, "meta"), { recursive: true });
  await writeFile(
    join(folder, "meta", "_journal.json"),
    JSON.stringify(EMBEDDED_JOURNAL),
  );

  for (const entry of EMBEDDED_MIGRATIONS) {
    await writeFile(join(folder, `${entry.tag}.sql`), entry.sql);
  }

  return folder;
}

/**
 * The migration folder to apply. Prefers the drizzle/ directory when it is
 * present, and otherwise falls back to the inlined copy, which is what makes a
 * compiled single-file binary self-contained.
 */
export async function migrationsDirectory(): Promise<string> {
  const folder = migrationsFolder();
  if (existsSync(folder)) return folder;
  return materializeEmbeddedMigrations();
}
