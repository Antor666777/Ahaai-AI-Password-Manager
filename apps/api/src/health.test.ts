import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@ahaai/db/types";
import { createTestApi, type TestApi } from "./testing/client";

/** Stands in for a Postgres that has gone away, so the probe reports 503. */
function failingDb(): Database {
  return {
    execute: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    },
  } as unknown as Database;
}

describe("health (liveness)", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.close();
  });

  it("stays cheap and exposes the service version and uptime", async () => {
    const response = await api.get("/health");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ahaai-password-manager");
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.uptimeMs).toBe("number");
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe("readiness probe", () => {
  it("returns 200 with a per-dependency check when everything is up", async () => {
    const api = await createTestApi();
    try {
      const response = await api.get("/health/ready");
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe("ok");
      expect(body.checks.database.status).toBe("up");
      expect(typeof body.checks.database.latencyMs).toBe("number");
      // No REDIS_URL configured, so there is no redis dependency to check.
      expect(body.checks.redis).toBeUndefined();
      expect(body.rateLimiter.backend).toBe("memory");
      expect(body.rateLimiter.degraded).toBe(false);
    } finally {
      await api.close();
    }
  });

  it("returns 503 with the failing dependency when the database is down", async () => {
    const api = await createTestApi({ db: failingDb() });
    try {
      const response = await api.get("/health/ready");
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.status).toBe("unavailable");
      expect(body.checks.database.status).toBe("down");
      // The raw driver error can name internal hosts, so it never reaches an
      // unauthenticated caller.
      expect(body.checks.database.error).toBeUndefined();
    } finally {
      await api.close();
    }
  });

  it("pings a configured Redis and reports it down when it fails", async () => {
    const api = await createTestApi({
      redisHealthProbe: async () => {
        throw new Error("redis unreachable");
      },
    });
    try {
      const response = await api.get("/health/ready");
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.checks.database.status).toBe("up");
      expect(body.checks.redis.status).toBe("down");
      expect(body.checks.redis.error).toBeUndefined();
    } finally {
      await api.close();
    }
  });

  it("stays ready when a configured Redis answers PING", async () => {
    const api = await createTestApi({ redisHealthProbe: async () => {} });
    try {
      const response = await api.get("/health/ready");
      expect(response.status).toBe(200);
      expect((await response.json()).checks.redis.status).toBe("up");
    } finally {
      await api.close();
    }
  });
});
