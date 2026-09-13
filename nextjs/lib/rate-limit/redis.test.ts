import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisRateLimiter, type WindowStore } from "./redis";

/** Minimal in-memory stand-in for the Redis sliding-window store. */
class FakeWindowStore implements WindowStore {
  private readonly windows = new Map<string, number[]>();
  private readonly blocks = new Map<string, number>();

  async hit({
    key,
    now,
    windowMs,
    limit,
  }: {
    key: string;
    now: number;
    windowMs: number;
    limit: number;
  }) {
    const recent = (this.windows.get(key) ?? []).filter(
      (timestamp) => timestamp > now - windowMs,
    );

    if (recent.length >= limit) {
      return {
        allowed: false,
        count: recent.length,
        resetAt: (recent[0] ?? now) + windowMs,
      };
    }

    recent.push(now);
    this.windows.set(key, recent);
    return {
      allowed: true,
      count: recent.length,
      resetAt: (recent[0] ?? now) + windowMs,
    };
  }

  async getBlock(key: string): Promise<number | null> {
    return this.blocks.get(key) ?? null;
  }

  async setBlock(key: string, ms: number): Promise<void> {
    this.blocks.set(key, Date.now() + ms);
  }
}

describe("RedisRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit and reports remaining", async () => {
    const limiter = new RedisRateLimiter(new FakeWindowStore());
    const rule = { points: 3, windowMs: 1000 };

    expect(await limiter.limit("k", rule)).toMatchObject({
      ok: true,
      remaining: 2,
    });
    expect(await limiter.limit("k", rule)).toMatchObject({
      ok: true,
      remaining: 1,
    });
    expect(await limiter.limit("k", rule)).toMatchObject({
      ok: true,
      remaining: 0,
    });
    expect((await limiter.limit("k", rule)).ok).toBe(false);
  });

  it("applies a block and persists it across the window", async () => {
    const limiter = new RedisRateLimiter(new FakeWindowStore());
    const rule = { points: 1, windowMs: 1000, blockMs: 5000 };

    expect((await limiter.limit("k", rule)).ok).toBe(true);

    const blocked = await limiter.limit("k", rule);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(5);

    vi.setSystemTime(Date.now() + 3000);
    expect((await limiter.limit("k", rule)).ok).toBe(false);

    vi.setSystemTime(Date.now() + 3000);
    expect((await limiter.limit("k", rule)).ok).toBe(true);
  });
});
