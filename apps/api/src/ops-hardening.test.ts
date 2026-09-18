import { describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@ahaai/core/rate-limit";
import { createTestApi, registrationBody, sessionCookie } from "./testing/client";

describe("global rate limiting", () => {
  it("throttles a previously-unthrottled route once the per-IP limit is passed", async () => {
    const api = await createTestApi();
    try {
      const ip = "10.9.9.9";
      let sawRateLimited = false;

      // GET /vault/sync carries no stricter rule of its own, so only the new
      // global middleware can stop it. Requests 1..N are rejected by auth (401);
      // once the IP passes the ceiling, the middleware answers 429 first.
      for (let i = 0; i < RATE_LIMITS.global.points + 5; i += 1) {
        const response = await api.get("/api/v1/vault/sync", { ip });
        if (response.status === 429) {
          expect(response.headers.get("retry-after")).toBeTruthy();
          sawRateLimited = true;
          break;
        }
        expect(response.status).toBe(401);
      }

      expect(sawRateLimited).toBe(true);
    } finally {
      await api.close();
    }
  });
});

describe("trust proxy wiring", () => {
  it("suppresses forwarded headers through the request path when TRUST_PROXY=0", async () => {
    const api = await createTestApi({ env: { TRUST_PROXY: "0" } });
    try {
      const registration = await api.post(
        "/api/v1/auth/register",
        await registrationBody("trust-proxy-off@example.com"),
        { ip: "203.0.113.9" },
      );
      expect(registration.status).toBe(201);

      const cookie = sessionCookie(registration);
      expect(cookie).toBeTruthy();

      const session = await api.get("/api/v1/auth/session", { cookie });
      expect(session.status).toBe(200);
      expect((await session.json()).session.ipAddress).toBeNull();
    } finally {
      await api.close();
    }
  });

  it("records the forwarded client IP when the proxy is trusted (default)", async () => {
    const api = await createTestApi();
    try {
      const registration = await api.post(
        "/api/v1/auth/register",
        await registrationBody("trust-proxy-on@example.com"),
        { ip: "203.0.113.9" },
      );
      expect(registration.status).toBe(201);

      const cookie = sessionCookie(registration);
      const session = await api.get("/api/v1/auth/session", { cookie });
      expect(session.status).toBe(200);
      expect((await session.json()).session.ipAddress).toBe("203.0.113.9");
    } finally {
      await api.close();
    }
  });
});
