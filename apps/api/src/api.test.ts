import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApi,
  ENVELOPE,
  EXTENSION_ORIGIN,
  HIBP_BODY,
  HOST,
  ORIGIN,
  registrationBody,
  SEPARATE_FRONTEND_ORIGIN,
  sessionCookie,
  sessionToken,
  type RequestOptions,
  type TestApi,
} from "./testing/client";

const stubFetch: typeof fetch = async () => new Response(HIBP_BODY, { status: 200 });

let api: TestApi;

const get = (path: string, options?: RequestOptions) => api.get(path, options);
const post = (path: string, body?: unknown, options?: RequestOptions) =>
  api.post(path, body, options);
const patch = (path: string, body: unknown, options?: RequestOptions) =>
  api.patch(path, body, options);
const del = (path: string, options?: RequestOptions) => api.del(path, options);

beforeAll(async () => {
  api = await createTestApi({ fetchImpl: stubFetch });
});

afterAll(async () => {
  await api.close();
});

async function registerAndGetCookie(email: string): Promise<string> {
  const response = await post("/api/v1/auth/register", await registrationBody(email));
  if (response.status !== 201) {
    throw new Error(`registration failed: ${response.status} ${await response.text()}`);
  }
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error("registration did not set a session cookie");
  return cookie;
}

describe("health and middleware", () => {
  it("answers health and sets the security headers", async () => {
    const response = await get("/health");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");

    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns the documented shape for an unknown route", async () => {
    const response = await get("/api/v1/nope");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("auth routes", () => {
  it("registers a user, sets a cookie and never echoes the auth hash", async () => {
    const response = await post(
      "/api/v1/auth/register",
      await registrationBody("api-register@example.com"),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");

    const body = await response.json();
    expect(body.user.email).toBe("api-register@example.com");
    expect(body.vault.protectedVaultKey).toMatch(/^v1\./);
    expect(JSON.stringify(body)).not.toContain("authHash");
  });

  it("rejects a malformed body", async () => {
    const response = await post("/api/v1/auth/register", { email: "not-an-email" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("blocks a cross-origin cookie request", async () => {
    const response = await post(
      "/api/v1/auth/register",
      await registrationBody("api-csrf@example.com"),
      { origin: "http://evil.example" },
    );
    expect(response.status).toBe(403);
  });

  it("requires a session for the session endpoint", async () => {
    const response = await get("/api/v1/auth/session");
    expect(response.status).toBe(401);
  });

  it("logs in, reads the session and logs out", async () => {
    const cookie = await registerAndGetCookie("api-session@example.com");

    const session = await get("/api/v1/auth/session", { cookie });
    expect(session.status).toBe(200);
    const sessionBody = await session.json();
    expect(sessionBody.user.email).toBe("api-session@example.com");
    expect(sessionBody.session.current).toBe(true);

    const logout = await post("/api/v1/auth/logout", undefined, { cookie });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const after = await get("/api/v1/auth/session", { cookie });
    expect(after.status).toBe(401);
  });

  it("returns a generic error for bad credentials", async () => {
    const cookie = await registerAndGetCookie("api-login@example.com");
    expect(cookie).toContain("ahaai_session=");

    const bad = await post("/api/v1/auth/login", {
      email: "api-login@example.com",
      authHash: "0".repeat(64),
    });
    expect(bad.status).toBe(401);
    const body = await bad.json();
    expect(body.error.message).toBe("Invalid email or master password");
  });

  it("gives an unknown email a deterministic KDF decoy", async () => {
    const first = await get("/api/v1/auth/prelogin?email=ghost%40example.com");
    const second = await get("/api/v1/auth/prelogin?email=ghost%40example.com");

    expect(first.status).toBe(200);
    const a = await first.json();
    const b = await second.json();
    expect(a.kdfParams.salt).toBe(b.kdfParams.salt);
    expect(a.kdfParams.algo).toBe("argon2id");
  });
});

describe("account lifecycle and session admin", () => {
  it("signs out other devices while this one stays signed in", async () => {
    const credentials = await registrationBody("api-revoke-all@example.com");
    const cookie = sessionCookie(await post("/api/v1/auth/register", credentials));
    if (!cookie) throw new Error("registration did not set a session cookie");

    // A second live session, as an extension would hold.
    const issued = await post("/api/v1/auth/token", {
      email: credentials.email,
      authHash: credentials.authHash,
    });
    expect(issued.status).toBe(200);

    const revoked = await post("/api/v1/auth/sessions/revoke-all", {}, { cookie });
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).revoked).toBe(1);
    // The caller kept its own session, so no cookie is cleared.
    expect(revoked.headers.get("set-cookie")).toBeNull();

    const list = (await (await get("/api/v1/auth/sessions", { cookie })).json())
      .sessions;
    expect(list).toHaveLength(1);
    expect(list[0].current).toBe(true);
  });

  it("ends this session too when includeCurrent is set", async () => {
    const cookie = await registerAndGetCookie("api-revoke-current@example.com");

    const revoked = await post(
      "/api/v1/auth/sessions/revoke-all",
      { includeCurrent: true },
      { cookie },
    );
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).revoked).toBe(1);
    expect(revoked.headers.get("set-cookie")).toContain("Max-Age=0");

    const after = await get("/api/v1/auth/session", { cookie });
    expect(after.status).toBe(401);
  });

  it("confirms the master password and rejects a wrong one generically", async () => {
    const credentials = await registrationBody("api-verify@example.com");
    const cookie = sessionCookie(await post("/api/v1/auth/register", credentials));
    if (!cookie) throw new Error("registration did not set a session cookie");

    const good = await post(
      "/api/v1/auth/verify",
      { authHash: credentials.authHash },
      { cookie },
    );
    expect(good.status).toBe(200);
    expect((await good.json()).ok).toBe(true);

    const bad = await post(
      "/api/v1/auth/verify",
      { authHash: "0".repeat(64) },
      { cookie },
    );
    expect(bad.status).toBe(401);
    const body = await bad.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    // Nothing about the account leaks in the failure.
    expect(JSON.stringify(body)).not.toContain(credentials.email);
  });

  it("rate limits repeated master password checks", async () => {
    const credentials = await registrationBody("api-verify-limit@example.com");
    const cookie = sessionCookie(await post("/api/v1/auth/register", credentials));
    if (!cookie) throw new Error("registration did not set a session cookie");

    let status = 0;
    for (let i = 0; i < 12; i += 1) {
      const response = await post(
        "/api/v1/auth/verify",
        { authHash: "0".repeat(64) },
        { cookie },
      );
      status = response.status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });

  it("changes the email, signs out other devices and keeps this one", async () => {
    const credentials = await registrationBody("api-email-old@example.com");
    const cookie = sessionCookie(await post("/api/v1/auth/register", credentials));
    if (!cookie) throw new Error("registration did not set a session cookie");
    await post("/api/v1/auth/token", {
      email: credentials.email,
      authHash: credentials.authHash,
    });

    const changed = await post(
      "/api/v1/auth/email",
      { email: "api-email-new@example.com", protectedVaultKey: ENVELOPE },
      { cookie },
    );
    expect(changed.status).toBe(200);
    const body = await changed.json();
    expect(body.user.email).toBe("api-email-new@example.com");
    expect(body.revokedSessions).toBe(1);
    expect(JSON.stringify(body)).not.toContain("authHash");

    // The re-wrap still leaves this device signed in.
    expect((await get("/api/v1/auth/session", { cookie })).status).toBe(200);
  });

  it("refuses an email already in use", async () => {
    await registerAndGetCookie("api-email-taken@example.com");
    const cookie = await registerAndGetCookie("api-email-changer@example.com");

    const conflict = await post(
      "/api/v1/auth/email",
      { email: "api-email-taken@example.com", protectedVaultKey: ENVELOPE },
      { cookie },
    );
    expect(conflict.status).toBe(409);
  });

  it("deletes the account, clears the cookie and frees the address", async () => {
    const credentials = await registrationBody("api-delete@example.com");
    const cookie = sessionCookie(await post("/api/v1/auth/register", credentials));
    if (!cookie) throw new Error("registration did not set a session cookie");

    const deleted = await api.request(
      "DELETE",
      "/api/v1/auth/account",
      { authHash: credentials.authHash },
      { cookie },
    );
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).deleted).toBe(true);
    expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");

    expect((await get("/api/v1/auth/session", { cookie })).status).toBe(401);

    const reuse = await post(
      "/api/v1/auth/register",
      await registrationBody("api-delete@example.com"),
    );
    expect(reuse.status).toBe(201);
  });

  it("refuses account deletion with the wrong master password", async () => {
    const credentials = await registrationBody("api-delete-wrong@example.com");
    const cookie = sessionCookie(await post("/api/v1/auth/register", credentials));
    if (!cookie) throw new Error("registration did not set a session cookie");

    const refused = await api.request(
      "DELETE",
      "/api/v1/auth/account",
      { authHash: "0".repeat(64) },
      { cookie },
    );
    expect(refused.status).toBe(401);
    expect((await get("/api/v1/auth/session", { cookie })).status).toBe(200);
  });
});

describe("vault routes", () => {
  it("runs an item through create, list, update, conflict, trash, restore and purge", async () => {
    const cookie = await registerAndGetCookie("api-vault@example.com");
    const options = { cookie };

    const created = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE },
      options,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const id: string = createdBody.item.id;
    expect(createdBody.item.revision).toBe(1);
    expect(createdBody.item.type).toBe("login");

    const listed = await get("/api/v1/vault/items", options);
    expect(listed.status).toBe(200);
    expect((await listed.json()).items).toHaveLength(1);

    const updated = await patch(`/api/v1/vault/items/${id}`, { revision: 1, favorite: true }, options);
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.item.revision).toBe(2);
    expect(updatedBody.item.favorite).toBe(true);

    const stale = await patch(`/api/v1/vault/items/${id}`, { revision: 1, favorite: false }, options);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.details.currentRevision).toBe(2);

    const trashed = await del(`/api/v1/vault/items/${id}`, options);
    expect(trashed.status).toBe(200);
    expect((await trashed.json()).item.deletedAt).not.toBeNull();

    const restored = await post(`/api/v1/vault/items/${id}/restore`, undefined, options);
    expect(restored.status).toBe(200);
    expect((await restored.json()).item.deletedAt).toBeNull();

    await del(`/api/v1/vault/items/${id}`, options);
    const purged = await del(`/api/v1/vault/items/${id}/purge`, options);
    expect(purged.status).toBe(200);

    const missing = await get(`/api/v1/vault/items/${id}`, options);
    expect(missing.status).toBe(404);
  });

  it("detaches items when their folder is deleted", async () => {
    const cookie = await registerAndGetCookie("api-folders@example.com");
    const options = { cookie };

    const folderResponse = await post("/api/v1/vault/folders", { nameEnc: ENVELOPE }, options);
    expect(folderResponse.status).toBe(201);
    const folderId: string = (await folderResponse.json()).folder.id;

    const itemResponse = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE, folderId },
      options,
    );
    expect(itemResponse.status).toBe(201);
    const itemId: string = (await itemResponse.json()).item.id;

    const deleted = await del(`/api/v1/vault/folders/${folderId}`, options);
    expect(deleted.status).toBe(200);

    const item = await get(`/api/v1/vault/items/${itemId}`, options);
    expect((await item.json()).item.folderId).toBeNull();
  });

  it("keeps one user's items out of another user's vault", async () => {
    const alice = await registerAndGetCookie("api-alice@example.com");
    const bob = await registerAndGetCookie("api-bob@example.com");

    const created = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE },
      { cookie: alice },
    );
    const id: string = (await created.json()).item.id;

    const stolen = await get(`/api/v1/vault/items/${id}`, { cookie: bob });
    expect(stolen.status).toBe(404);
  });
});

describe("bearer and CORS for extensions", () => {
  it("issues a bearer token that works with no cookie at all", async () => {
    const credentials = await registrationBody("api-token@example.com");
    await post("/api/v1/auth/register", credentials);

    const issued = await post("/api/v1/auth/token", {
      email: credentials.email,
      authHash: credentials.authHash,
    });
    expect(issued.status).toBe(200);
    expect(issued.headers.get("set-cookie")).toBeNull();

    const body = await issued.json();
    expect(body.tokenType).toBe("Bearer");
    expect(typeof body.token).toBe("string");

    const session = await get("/api/v1/auth/session", { bearer: body.token });
    expect(session.status).toBe(200);
    expect((await session.json()).user.email).toBe("api-token@example.com");
  });

  it("accepts a session token as a bearer token from an extension origin", async () => {
    const registered = await post(
      "/api/v1/auth/register",
      await registrationBody("api-extension@example.com"),
    );
    const token = sessionToken(registered);
    expect(token).toBeTruthy();

    const response = await get("/api/v1/vault/items", {
      bearer: token,
      origin: EXTENSION_ORIGIN,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(EXTENSION_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("lets a bearer client write without a same-origin cookie", async () => {
    const registered = await post(
      "/api/v1/auth/register",
      await registrationBody("api-extension-write@example.com"),
    );
    const token = sessionToken(registered);

    const created = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE },
      { bearer: token, origin: EXTENSION_ORIGIN },
    );

    expect(created.status).toBe(201);
  });

  it("still refuses cross-origin cookie writes", async () => {
    const cookie = await registerAndGetCookie("api-cookie-csrf@example.com");

    const created = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE },
      { cookie, origin: EXTENSION_ORIGIN },
    );

    expect(created.status).toBe(403);
  });

  it("answers preflight for an allowed origin and stays silent for others", async () => {
    const allowed = await api.app.request(`${ORIGIN}/api/v1/vault/items`, {
      method: "OPTIONS",
      headers: {
        host: HOST,
        origin: EXTENSION_ORIGIN,
        "access-control-request-method": "GET",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(EXTENSION_ORIGIN);
    expect(allowed.headers.get("access-control-allow-headers")).toContain("Authorization");

    const denied = await api.app.request(`${ORIGIN}/api/v1/vault/items`, {
      method: "OPTIONS",
      headers: {
        host: HOST,
        origin: "https://evil.example",
        "access-control-request-method": "GET",
      },
    });
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("trusted origins", () => {
  it("allows cookie auth from an explicitly listed frontend origin only", async () => {
    const cookie = await registerAndGetCookie("api-trusted-origin@example.com");
    const body = JSON.stringify({
      type: "login",
      nameEnc: ENVELOPE,
      dataEnc: ENVELOPE,
    });

    const trusted = await api.app.request("http://api.example/api/v1/vault/items", {
      method: "POST",
      headers: {
        host: "api.example",
        origin: SEPARATE_FRONTEND_ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": "10.4.4.4",
        cookie,
      },
      body,
    });
    expect(trusted.status).toBe(201);

    const untrusted = await api.app.request("http://api.example/api/v1/vault/items", {
      method: "POST",
      headers: {
        host: "api.example",
        origin: "http://evil.example",
        "content-type": "application/json",
        "x-forwarded-for": "10.4.4.5",
        cookie,
      },
      body,
    });
    expect(untrusted.status).toBe(403);
  });
});

describe("pwned range", () => {
  it("proxies the k-anonymity range through the injected fetch", async () => {
    const response = await get("/api/v1/pwned/range?prefix=ABCDE");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prefix).toBe("ABCDE");
    expect(body.suffixes).toContain("0018A45C4D1DEF81644B54AB7F969B88D65:3");
  });

  it("rejects a malformed prefix", async () => {
    const response = await get("/api/v1/pwned/range?prefix=ZZZ");
    expect(response.status).toBe(400);
  });

  it("returns 429 once an IP passes its limit", async () => {
    const ip = "10.7.7.7";
    let lastStatus = 0;

    for (let i = 0; i < 61; i += 1) {
      const response = await get("/api/v1/pwned/range?prefix=ABCDE", { ip });
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
  });
});
