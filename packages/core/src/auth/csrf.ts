import { AppError } from "@ahaai/core/http/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Defends state-changing requests against CSRF. A browser request must either be
 * same-origin, or come from an origin the operator listed explicitly.
 *
 * Only an exact origin counts as trusted. A wildcard entry deliberately does
 * not: trusting `chrome-extension://*` would let any installed extension act
 * with the user's session cookie, and cross-origin clients are expected to use
 * a bearer token instead.
 *
 * Requests without Origin (CLI, tests) are allowed and remain protected by the
 * SameSite=Lax session cookie.
 */
export function assertSameOrigin(
  request: Request,
  trustedOrigins: string[] = [],
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw AppError.forbidden("Cross-site request blocked");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  if (trustedOrigins.includes(origin)) return;

  const host = request.headers.get("host");
  if (!host) throw AppError.forbidden("Missing host header");

  if (hostOf(origin) !== host) {
    throw AppError.forbidden("Cross-origin request blocked");
  }
}
