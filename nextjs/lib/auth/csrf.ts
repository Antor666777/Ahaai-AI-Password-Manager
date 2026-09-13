import { AppError } from "@/lib/http/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Defends state-changing requests against CSRF. Browser requests must either
 * carry a same-origin Origin header or a same-origin `Sec-Fetch-Site` value.
 * Requests without Origin (CLI, tests) are allowed and still protected by the
 * SameSite=Lax session cookie.
 */
export function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw AppError.forbidden("Cross-site request blocked");
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("host");
  if (!host) throw AppError.forbidden("Missing host header");

  if (hostOf(origin) !== host) {
    throw AppError.forbidden("Cross-origin request blocked");
  }
}
