import { afterEach, describe, expect, it } from "vitest";
import { getClientIp } from "./request-context";

const original = process.env.TRUST_PROXY;

afterEach(() => {
  if (original === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = original;
});

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/test", { headers });
}

describe("getClientIp", () => {
  it("reads the forwarded chain by default, taking the first hop", () => {
    delete process.env.TRUST_PROXY;
    expect(
      getClientIp(request({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
    ).toBe("203.0.113.9");

    expect(getClientIp(request({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
  });

  it("ignores forwarded headers when the proxy is not trusted", () => {
    // A directly reachable deployment let any caller invent x-forwarded-for
    // and slip past the per-IP rate limits.
    process.env.TRUST_PROXY = "0";
    expect(
      getClientIp(request({ "x-forwarded-for": "203.0.113.9" })),
    ).toBeNull();
    expect(getClientIp(request({ "x-real-ip": "198.51.100.4" }))).toBeNull();
  });

  it("truncates an overlong header", () => {
    delete process.env.TRUST_PROXY;
    const ip = getClientIp(request({ "x-forwarded-for": "a".repeat(200) }));
    expect(ip).toHaveLength(64);
  });
});
