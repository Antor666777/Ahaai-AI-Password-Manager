import { afterEach, describe, expect, it } from "vitest";
import {
  serializeCookie,
  sessionCookieOptions,
  sessionTtlMs,
} from "./cookies";

const KEYS = ["NODE_ENV", "COOKIE_SECURE", "SESSION_TTL_DAYS"] as const;
const originals = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setEnv(key: (typeof KEYS)[number], value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

afterEach(() => {
  for (const key of KEYS) setEnv(key, originals[key]);
});

describe("sessionCookieOptions", () => {
  it("always sets HttpOnly, SameSite=Lax and Path=/", () => {
    const cookie = serializeCookie(
      "ahaai_session",
      "token",
      sessionCookieOptions(60_000),
    );
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("marks the cookie Secure for a production build", () => {
    setEnv("NODE_ENV", "production");
    setEnv("COOKIE_SECURE", undefined);
    expect(sessionCookieOptions(1000).secure).toBe(true);
  });

  it("lets COOKIE_SECURE override the build environment both ways", () => {
    // A production build on a plain-HTTP origin must be able to drop Secure,
    // or the browser discards the cookie and sign in silently fails.
    setEnv("NODE_ENV", "production");
    setEnv("COOKIE_SECURE", "false");
    expect(sessionCookieOptions(1000).secure).toBe(false);

    setEnv("NODE_ENV", "development");
    setEnv("COOKIE_SECURE", "true");
    expect(sessionCookieOptions(1000).secure).toBe(true);
  });
});

describe("sessionTtlMs", () => {
  it("falls back to 30 days for unusable values", () => {
    setEnv("SESSION_TTL_DAYS", "not-a-number");
    expect(sessionTtlMs()).toBe(30 * 86_400_000);

    setEnv("SESSION_TTL_DAYS", "-5");
    expect(sessionTtlMs()).toBe(30 * 86_400_000);

    setEnv("SESSION_TTL_DAYS", "0");
    expect(sessionTtlMs()).toBe(30 * 86_400_000);
  });

  it("honours a positive value", () => {
    setEnv("SESSION_TTL_DAYS", "7");
    expect(sessionTtlMs()).toBe(7 * 86_400_000);
  });
});
