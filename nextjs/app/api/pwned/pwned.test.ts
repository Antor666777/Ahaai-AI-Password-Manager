import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCache } from "@/lib/cache";
import { GET as rangeRoute } from "@/app/api/pwned/range/route";

const SUFFIX = "C".repeat(35);
const ORIGIN = "http://localhost:3000";

function request(query: string): Request {
  return new Request(`${ORIGIN}/api/pwned/range?${query}`, {
    headers: { host: "localhost:3000" },
  });
}

describe("pwned range route", () => {
  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the k-anonymity range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(`${SUFFIX}:7`, { status: 200 }),
      ),
    );

    const response = await rangeRoute(request("prefix=ABCDE"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.prefix).toBe("ABCDE");
    expect(body.suffixes).toContain(`${SUFFIX}:7`);
    expect(body.cached).toBe(false);
  });

  it("rejects invalid prefixes", async () => {
    const response = await rangeRoute(request("prefix=XYZ"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("surfaces upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    const response = await rangeRoute(request("prefix=ABCDE"));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("UPSTREAM");
  });
});
