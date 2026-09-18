const BEARER_RE = /^Bearer[ \t]+(\S+)$/i;

/**
 * Extracts a bearer token from the Authorization header. Returns undefined for
 * any other scheme so the caller can fall back to the session cookie.
 */
export function getBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = BEARER_RE.exec(header.trim());
  return match?.[1];
}
