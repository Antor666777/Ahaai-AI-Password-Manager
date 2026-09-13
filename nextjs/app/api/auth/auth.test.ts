import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildRegistrationMaterial } from "@/lib/crypto/vault-key";
import type { Database } from "@/lib/db/types";
import { deriveAuthHash, TEST_PASSWORD } from "@/test/helpers/auth";
import { cheapKdfParams } from "@/test/helpers/crypto";
import { createTestDb, type TestDb } from "@/test/helpers/db";

const dbHolder = vi.hoisted(() => ({ current: null as unknown as Database }));
vi.mock("@/lib/db/client", () => ({ getDb: () => dbHolder.current }));

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { createTestUser } from "@/test/helpers/auth";

const ORIGIN = "http://localhost:3000";
const HOST = "localhost:3000";

function jsonRequest(
  path: string,
  body: unknown,
  options: { cookie?: string; origin?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: HOST,
  };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin) headers.origin = origin;
  if (options.cookie) headers.cookie = options.cookie;

  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, cookie?: string): Request {
  const headers: Record<string, string> = { host: HOST };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { headers });
}

function sessionCookieFrom(response: Response): string | undefined {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : undefined;
}

async function registrationBody(email: string) {
  const kdfParams = cheapKdfParams();
  const authHash = await deriveAuthHash(TEST_PASSWORD, kdfParams);
  const material = await buildRegistrationMaterial(
    TEST_PASSWORD,
    kdfParams,
    email.trim().toLowerCase(),
  );
  return {
    email,
    authHash,
    kdfParams,
    protectedVaultKey: material.protectedVaultKey,
  };
}

describe("auth routes", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
    dbHolder.current = ctx.db as unknown as Database;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("registers a user and sets a session cookie", async () => {
    const response = await registerRoute(
      jsonRequest("/api/auth/register", await registrationBody("route1@example.com")),
    );

    expect(response.status).toBe(201);
    const cookie = sessionCookieFrom(response);
    expect(cookie).toContain("ahaai_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");

    const body = await response.json();
    expect(body.user.email).toBe("route1@example.com");
    expect(body.vault.protectedVaultKey).toMatch(/^v1\./);
    expect(JSON.stringify(body)).not.toContain("authHash");
  });

  it("rejects malformed registration bodies", async () => {
    const response = await registerRoute(
      jsonRequest("/api/auth/register", { email: "not-an-email" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("blocks cross-origin requests", async () => {
    const response = await registerRoute(
      jsonRequest("/api/auth/register", await registrationBody("csrf@example.com"), {
        origin: "http://evil.example",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("returns a generic error for bad credentials", async () => {
    const user = await createTestUser(ctx.db, { email: "route-login@example.com" });
    const good = await loginRoute(
      jsonRequest("/api/auth/login", { email: user.email, authHash: user.authHash }),
    );
    expect(good.status).toBe(200);
    expect(sessionCookieFrom(good)).toContain("ahaai_session=");

    const bad = await loginRoute(
      jsonRequest("/api/auth/login", { email: user.email, authHash: "0".repeat(64) }),
    );
    expect(bad.status).toBe(401);
    const body = await bad.json();
    expect(body.error.message).toBe("Invalid email or master password");
  });

  it("reads the current session and logs out", async () => {
    const registered = await registerRoute(
      jsonRequest("/api/auth/register", await registrationBody("route2@example.com")),
    );
    const cookie = sessionCookieFrom(registered);
    expect(cookie).toBeTruthy();

    const sessionResponse = await sessionRoute(
      getRequest("/api/auth/session", cookie),
    );
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody.user.email).toBe("route2@example.com");
    expect(sessionBody.session.current).toBe(true);

    const logout = await logoutRoute(
      jsonRequest("/api/auth/logout", {}, { cookie }),
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const afterLogout = await sessionRoute(
      getRequest("/api/auth/session", cookie),
    );
    expect(afterLogout.status).toBe(401);
  });

  it("requires authentication for the session endpoint", async () => {
    const response = await sessionRoute(getRequest("/api/auth/session"));
    expect(response.status).toBe(401);
  });
});
