import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@ahaai/core/http/errors";
import { enforceRateLimit, getRateLimiter, resetRateLimiter } from "./index";
import { MemoryRateLimiter } from "./memory";

describe("rate limiter factory", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    resetRateLimiter();
  });

  afterEach(() => {
    resetRateLimiter();
  });

  it("falls back to the in-memory backend without REDIS_URL", async () => {
    expect(await getRateLimiter()).toBeInstanceOf(MemoryRateLimiter);
  });

  it("throws a 429 AppError with retry-after once a limit is exceeded", async () => {
    const identifier = `test:${Date.now()}`;
    // register allows 5 per hour.
    for (let i = 0; i < 5; i += 1) {
      await expect(
        enforceRateLimit("register", identifier),
      ).resolves.toBeUndefined();
    }

    const error = await enforceRateLimit("register", identifier).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.status).toBe(429);
    expect(appError.code).toBe("RATE_LIMITED");
    expect(
      (appError.details as { retryAfterSeconds: number }).retryAfterSeconds,
    ).toBeGreaterThan(0);
  });
});
