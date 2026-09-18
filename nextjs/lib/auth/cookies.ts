export const SESSION_COOKIE = "ahaai_session";
const DEFAULT_TTL_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? DEFAULT_TTL_DAYS);
  const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
  return safeDays * MS_PER_DAY;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAgeSeconds: number;
}

/**
 * `NODE_ENV` describes the build, not the scheme the browser is actually on.
 * A production build served over plain HTTP would set `Secure` and have the
 * browser drop the cookie on the floor, so COOKIE_SECURE overrides it.
 */
function cookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAgeSeconds: Math.max(0, Math.floor(maxAgeMs / 1000)),
  };
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite === "lax" ? "Lax" : options.sameSite === "strict" ? "Strict" : "None"}`,
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildSessionCookie(token: string, maxAgeMs: number): string {
  return serializeCookie(SESSION_COOKIE, token, sessionCookieOptions(maxAgeMs));
}

export function buildClearSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAgeSeconds: 0,
  });
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    if (!name) continue;
    result[name] = pair.slice(index + 1).trim();
  }
  return result;
}

export function getSessionToken(request: Request): string | undefined {
  const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  return token && token.length > 0 ? token : undefined;
}
