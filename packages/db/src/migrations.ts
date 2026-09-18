import { fileURLToPath } from "node:url";

/**
 * Migration folder inside this package. Only correct when the source tree is
 * present, which is the case for development and for the tests.
 */
const PACKAGE_MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/**
 * Absolute path to the Drizzle migration folder.
 *
 * `AHAALI_MIGRATIONS_DIR` overrides it. A container image or a compiled binary
 * needs that, because `import.meta.url` no longer points into the repository
 * once the code has been bundled into a single file.
 */
export function migrationsFolder(): string {
  return process.env.AHAALI_MIGRATIONS_DIR ?? PACKAGE_MIGRATIONS_FOLDER;
}
