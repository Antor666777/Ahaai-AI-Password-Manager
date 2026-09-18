/**
 * Origin allowlist for browser clients other than the app itself, notably
 * `chrome-extension://<id>` entries. Matching supports an exact origin, a
 * trailing-`*` prefix, or the bare `*` wildcard.
 */
export function matchOrigin(origin: string, allowed: string[]): boolean {
  for (const pattern of allowed) {
    if (pattern === "*") return true;
    if (pattern === origin) return true;
    if (pattern.endsWith("*") && origin.startsWith(pattern.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/**
 * The subset of an allowlist that names one specific origin. Wildcards are
 * excluded on purpose: see `assertSameOrigin`.
 */
export function exactOrigins(allowed: string[]): string[] {
  return allowed.filter(
    (pattern) => pattern !== "*" && !pattern.endsWith("*"),
  );
}

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-Device-Name",
  "X-Device-Type",
].join(", ");

/**
 * Builds CORS headers for a request origin.
 *
 * Credentials are only ever allowed for an explicit origin or prefix match. A
 * bare `*` means a public, token-only API: echoing `*` together with
 * `Allow-Credentials` would let any site issue credentialed requests.
 */
export function corsHeaders(
  origin: string | null,
  allowed: string[],
): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
  };

  if (!origin) return headers;

  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    return headers;
  }

  const matched = allowed.some(
    (pattern) =>
      pattern === "*" ||
      (pattern.endsWith("*") && origin.startsWith(pattern.slice(0, -1))),
  );
  if (!matched) return headers;

  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }

  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}
