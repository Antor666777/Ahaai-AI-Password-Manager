import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRateLimiter } from "./memory";

describe("MemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit and then blocks", async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { points: 2, windowMs: 1000 };

    const first = await limiter.limit("k", rule);
    const second = await limiter.limit("k", rule);
    const third = await limiter.limit("k", rule);

    expect(first).toMatchObject({ ok: true, remaining: 1 });
    expect(second).toMatchObject({ ok: true, remaining: 0 });
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window passes", async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { points: 1, windowMs: 1000 };

    expect((await limiter.limit("k", rule)).ok).toBe(true);
    expect((await limiter.limit("k", rule)).ok).toBe(false);

    vi.setSystemTime(Date.now() + 1500);
    expect((await limiter.limit("k", rule)).ok).toBe(true);
  });

  it("honours blockMs for progressive lockout", async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { points: 1, windowMs: 1000, blockMs: 5000 };

    expect((await limiter.limit("k", rule)).ok).toBe(true);

    const blocked = await limiter.limit("k", rule);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(5);

    // Still blocked past the window, because the block is longer.
    vi.setSystemTime(Date.now() + 2000);
    expect((await limiter.limit("k", rule)).ok).toBe(false);

    vi.setSystemTime(Date.now() + 4000);
    expect((await limiter.limit("k", rule)).ok).toBe(true);
  });

  it("tracks keys independently", async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { points: 1, windowMs: 1000 };

    expect((await limiter.limit("a", rule)).ok).toBe(true);
    expect((await limiter.limit("b", rule)).ok).toBe(true);
    expect((await limiter.limit("a", rule)).ok).toBe(false);
  });

  it("bounds the number of tracked keys", async () => {
    const limiter = new MemoryRateLimiter(2);
    const rule = { points: 5, windowMs: 1000 };

    await limiter.limit("a", rule);
    await limiter.limit("b", rule);
    await limiter.limit("c", rule);

    const hits = (limiter as unknown as { hits: Map<string, number[]> }).hits;
    expect(hits.size).toBeLessThanOrEqual(2);
  });

  it("clears state on reset", async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { points: 1, windowMs: 1000 };

    await limiter.limit("k", rule);
    expect((await limiter.limit("k", rule)).ok).toBe(false);

    limiter.reset();
    expect((await limiter.limit("k", rule)).ok).toBe(true);
  });
});
