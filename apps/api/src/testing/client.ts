import { resetCache } from "@ahaai/core/cache";
import { buildRegistrationMaterial } from "@ahaai/core/crypto/vault-key";
import { resetRateLimiter } from "@ahaai/core/rate-limit";
import type { Database } from "@ahaai/db/types";
import { deriveAuthHash, TEST_PASSWORD } from "@ahaai/testing/helpers/auth";
import { cheapKdfParams } from "@ahaai/testing/helpers/crypto";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import { createApp } from "../app";
import { loadConfig } from "../config";
import { createDeps } from "../deps";

export const ORIGIN = "http://localhost:3000";
export const HOST = "localhost:3000";
export const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
export const EXTENSION_WILDCARD = "chrome-extension://*";
export const SEPARATE_FRONTEND_ORIGIN = "http://app.example";
export const ENVELOPE = "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB";
export const HIBP_BODY = "0018A45C4D1DEF81644B54AB7F969B88D65:3";

/**
 * `Response.json()` is typed as `unknown` without the DOM lib, which makes every
 * assertion in the tests awkward. Returning `any` here keeps them readable while
 * leaving production code fully typed.
 */
export type JsonResponse = Omit<Response, "json"> & { json(): Promise<any> };

export interface RequestOptions {
  ip?: string;
  cookie?: string;
  bearer?: string;
  origin?: string | null;
}

export interface TestApi {
  app: ReturnType<typeof createApp>;
  ctx: TestDb;
  request(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<JsonResponse>;
  get(path: string, options?: RequestOptions): Promise<JsonResponse>;
  post(path: string, body?: unknown, options?: RequestOptions): Promise<JsonResponse>;
  put(path: string, body?: unknown, options?: RequestOptions): Promise<JsonResponse>;
  patch(path: string, body: unknown, options?: RequestOptions): Promise<JsonResponse>;
  del(path: string, options?: RequestOptions): Promise<JsonResponse>;
  close(): Promise<void>;
}

export interface CreateTestApiOptions {
  fetchImpl?: typeof fetch;
  /** Override the injected database (e.g. to simulate a downed Postgres). */
  db?: Database;
  /** Inject a Redis readiness probe, standing in for a configured REDIS_URL. */
  redisHealthProbe?: () => Promise<void>;
  /** Extra environment for `loadConfig`, on top of the ambient `process.env`. */
  env?: Record<string, string | undefined>;
}

export async function createTestApi(
  options: CreateTestApiOptions = {},
): Promise<TestApi> {
  const ctx = await createTestDb();
  resetRateLimiter();
  resetCache();

  const config = loadConfig({
    ...process.env,
    ...options.env,
    // A wildcard for extensions, so the exact extension id never has to be
    // listed, plus one explicitly trusted separate frontend origin.
    CORS_ALLOWED_ORIGINS: [
      EXTENSION_WILDCARD,
      ORIGIN,
      SEPARATE_FRONTEND_ORIGIN,
    ].join(","),
  });

  const app = createApp(
    createDeps({
      config,
      db: options.db ?? (ctx.db as unknown as Database),
      fetchImpl: options.fetchImpl,
      redisHealthProbe: options.redisHealthProbe,
    }),
  );

  // Every request gets its own IP unless told otherwise, so per-IP limits do not
  // leak between tests that are not about rate limiting.
  let ipCounter = 0;
  const nextIp = () => `10.0.0.${(ipCounter += 1)}`;

  function headersFor(requestOptions: RequestOptions, json: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      host: HOST,
      "x-forwarded-for": requestOptions.ip ?? nextIp(),
    };
    if (json) headers["content-type"] = "application/json";

    const origin =
      requestOptions.origin === undefined ? ORIGIN : requestOptions.origin;
    if (origin) headers.origin = origin;
    if (requestOptions.cookie) headers.cookie = requestOptions.cookie;
    if (requestOptions.bearer) {
      headers.authorization = `Bearer ${requestOptions.bearer}`;
    }

    return headers;
  }

  const request = (
    method: string,
    path: string,
    body?: unknown,
    requestOptions: RequestOptions = {},
  ) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: headersFor(requestOptions, body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) as Promise<JsonResponse>;

  return {
    app,
    ctx,
    request,
    get: (path, requestOptions) => request("GET", path, undefined, requestOptions),
    post: (path, body, requestOptions) => request("POST", path, body, requestOptions),
    put: (path, body, requestOptions) => request("PUT", path, body, requestOptions),
    patch: (path, body, requestOptions) => request("PATCH", path, body, requestOptions),
    del: (path, requestOptions) => request("DELETE", path, undefined, requestOptions),
    close: () => ctx.close(),
  };
}

export function sessionCookie(response: Response): string | undefined {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : undefined;
}

export function sessionToken(response: Response): string | undefined {
  return sessionCookie(response)?.replace("ahaai_session=", "");
}

export function cookieFor(token: string): string {
  return `ahaai_session=${token}`;
}

export async function registrationBody(email: string) {
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
