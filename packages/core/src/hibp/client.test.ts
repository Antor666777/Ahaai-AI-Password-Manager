import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@ahaai/core/cache";
import {
  getPwnedRange,
  getPwnedRanges,
  isValidPrefix,
  MAX_PWNED_BATCH,
  PWNED_BATCH_CONCURRENCY,
} from "./client";

const SUFFIX = "A".repeat(35);

function makeFetch(
  body: string,
  options: { status?: number } = {},
): { fetchImpl: typeof fetch; calls: Array<{ url: string; headers: Headers }> } {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers ?? {}),
    });
    return new Response(body, {
      status: options.status ?? 200,
      headers: { "content-type": "text/plain" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("isValidPrefix", () => {
  it("accepts only 5-character hex prefixes", () => {
    expect(isValidPrefix("ABCDE")).toBe(true);
    expect(isValidPrefix("abcde")).toBe(true);
    expect(isValidPrefix("12345")).toBe(true);
    expect(isValidPrefix("ABCD")).toBe(false);
    expect(isValidPrefix("ABCDEF")).toBe(false);
    expect(isValidPrefix("XYZ12")).toBe(false);
    expect(isValidPrefix("")).toBe(false);
  });
});

describe("getPwnedRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches a range with the required headers and filters junk lines", async () => {
    const { fetchImpl, calls } = makeFetch(
      [`${SUFFIX}:3`, "garbage line", "not-a-hash:1", `${"B".repeat(35)}:0`].join("\n"),
    );

    const result = await getPwnedRange("abcde", {
      fetchImpl,
      cache: new MemoryCache(),
    });

    expect(result.prefix).toBe("ABCDE");
    expect(result.cached).toBe(false);
    expect(result.suffixes.split("\n")).toHaveLength(2);
    expect(result.suffixes).toContain(`${SUFFIX}:3`);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://api.pwnedpasswords.com/range/ABCDE`,
    );
    expect(calls[0].headers.get("add-padding")).toBe("true");
    expect(calls[0].headers.get("user-agent")).toBeTruthy();
  });

  it("serves repeat requests from cache", async () => {
    const cache = new MemoryCache();
    const first = makeFetch(`${SUFFIX}:1`);

    const one = await getPwnedRange("ABCDE", { fetchImpl: first.fetchImpl, cache });
    const two = await getPwnedRange("abcde", { fetchImpl: first.fetchImpl, cache });

    expect(one.cached).toBe(false);
    expect(two.cached).toBe(true);
    expect(first.calls).toHaveLength(1);
  });

  it("refetches once the cache entry expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const cache = new MemoryCache();
    const { fetchImpl, calls } = makeFetch(`${SUFFIX}:1`);

    await getPwnedRange("ABCDE", { fetchImpl, cache, ttlMs: 1000 });
    vi.setSystemTime(Date.now() + 2000);
    await getPwnedRange("ABCDE", { fetchImpl, cache, ttlMs: 1000 });

    expect(calls).toHaveLength(2);
  });

  it("rejects invalid prefixes", async () => {
    await expect(getPwnedRange("nope")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("maps upstream failures to a 502", async () => {
    const { fetchImpl } = makeFetch("server error", { status: 503 });
    await expect(
      getPwnedRange("ABCDE", { fetchImpl, cache: new MemoryCache() }),
    ).rejects.toMatchObject({ code: "UPSTREAM", status: 502 });
  });

  it("maps network errors to a 502", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;

    await expect(
      getPwnedRange("ABCDE", { fetchImpl, cache: new MemoryCache() }),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});

/** A distinct, valid 5-hex prefix per index (16^5 is far larger than any test). */
function prefixFor(index: number): string {
  return index.toString(16).toUpperCase().padStart(5, "0");
}

/** Fetch stub that tracks the peak number of requests in flight. */
function makeTrackedFetch(delayMs = 1): {
  fetchImpl: typeof fetch;
  calls: string[];
  peak: () => number;
} {
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  const fetchImpl = (async (url: string | URL | Request) => {
    active += 1;
    peak = Math.max(peak, active);
    // Yield so other workers can start, which is what exposes an unbounded fan.
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    calls.push(String(url));
    active -= 1;
    return new Response(`${SUFFIX}:1`, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, peak: () => peak };
}

describe("getPwnedRanges", () => {
  it("collapses duplicate prefixes to a single fetch", async () => {
    const { fetchImpl, calls } = makeFetch(`${SUFFIX}:1`);

    const ranges = await getPwnedRanges(
      { fetchImpl, cache: new MemoryCache() },
      ["abcde", "ABCDE", "AbCdE"],
    );

    expect(ranges).toHaveLength(1);
    expect(ranges[0].prefix).toBe("ABCDE");
    expect(calls).toHaveLength(1);
  });

  it("caps a batch at MAX_PWNED_BATCH unique prefixes", async () => {
    const { fetchImpl, calls } = makeFetch(`${SUFFIX}:1`);
    const prefixes = Array.from({ length: MAX_PWNED_BATCH + 5 }, (_, i) =>
      prefixFor(i),
    );

    const ranges = await getPwnedRanges(
      { fetchImpl, cache: new MemoryCache() },
      prefixes,
    );

    expect(ranges).toHaveLength(MAX_PWNED_BATCH);
    expect(calls).toHaveLength(MAX_PWNED_BATCH);
  });

  it("fans out with a bounded concurrency", async () => {
    const { fetchImpl, calls, peak } = makeTrackedFetch();
    const prefixes = Array.from({ length: 60 }, (_, i) => prefixFor(i));

    const ranges = await getPwnedRanges(
      { fetchImpl, cache: new MemoryCache() },
      prefixes,
    );

    expect(ranges).toHaveLength(60);
    expect(calls).toHaveLength(60);
    expect(peak()).toBeGreaterThan(1);
    expect(peak()).toBeLessThanOrEqual(PWNED_BATCH_CONCURRENCY);
  });

  it("rejects the whole batch when any prefix is invalid", async () => {
    const { fetchImpl, calls } = makeFetch(`${SUFFIX}:1`);

    await expect(
      getPwnedRanges({ fetchImpl, cache: new MemoryCache() }, ["ABCDE", "nope"]),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });

    expect(calls).toHaveLength(0);
  });

  it("shares the 24h range cache across calls", async () => {
    const cache = new MemoryCache();
    const { fetchImpl, calls } = makeFetch(`${SUFFIX}:1`);

    const first = await getPwnedRanges({ fetchImpl, cache }, ["ABCDE", "12345"]);
    const second = await getPwnedRanges({ fetchImpl, cache }, ["abcde", "12345"]);

    expect(calls).toHaveLength(2);
    expect(first.every((range) => range.cached === false)).toBe(true);
    expect(second.every((range) => range.cached === true)).toBe(true);
  });

  it("returns an empty list for no prefixes", async () => {
    const { fetchImpl, calls } = makeFetch(`${SUFFIX}:1`);
    const ranges = await getPwnedRanges({ fetchImpl, cache: new MemoryCache() }, []);
    expect(ranges).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
