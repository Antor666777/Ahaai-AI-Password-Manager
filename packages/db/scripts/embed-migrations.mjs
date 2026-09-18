// Inlines the Drizzle migration SQL into a TypeScript module so a compiled
// single-file binary has no drizzle/ folder to read at runtime.
//
// Run with: npm run db:embed --workspace @ahaai/db
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, "..", "drizzle");
const outputPath = join(here, "..", "src", "embedded-migrations.ts");

const journal = JSON.parse(
  await readFile(join(drizzleDir, "meta", "_journal.json"), "utf8"),
);

const migrations = [];
for (const entry of journal.entries) {
  const sql = await readFile(join(drizzleDir, `${entry.tag}.sql`), "utf8");
  migrations.push({ tag: entry.tag, when: entry.when, sql });
}

const embeddedJournal = {
  version: journal.version,
  dialect: journal.dialect,
  entries: journal.entries.map((entry) => ({
    idx: entry.idx,
    version: entry.version,
    when: entry.when,
    tag: entry.tag,
    breakpoints: entry.breakpoints,
  })),
};

const output = `// GENERATED FILE - do not edit by hand.
// Regenerate with: npm run db:embed --workspace @ahaai/db
// The test suite fails if this drifts from the drizzle/ folder.

export interface EmbeddedMigration {
  tag: string;
  when: number;
  sql: string;
}

export const EMBEDDED_JOURNAL = ${JSON.stringify(embeddedJournal, null, 2)} as const;

export const EMBEDDED_MIGRATIONS: EmbeddedMigration[] = ${JSON.stringify(migrations, null, 2)};
`;

await writeFile(outputPath, output);
console.log(`embedded ${migrations.length} migration(s) into src/embedded-migrations.ts`);
