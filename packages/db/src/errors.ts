/** Postgres SQLSTATE for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Postgres drivers wrap the original error, so the SQLSTATE can sit a few
 * `cause` links down rather than on the error itself.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code?: unknown }).code === UNIQUE_VIOLATION
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
