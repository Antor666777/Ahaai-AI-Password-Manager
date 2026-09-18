import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@ahaai/core/cache";
import { getPwnedRange, isValidPrefix } from "./client";

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
