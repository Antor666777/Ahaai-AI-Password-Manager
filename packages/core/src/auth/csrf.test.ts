import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@ahaai/core/auth/csrf";

function request(method: string, headers: Record<string, string>): Request {
  return new Request("http://api.example/api/v1/vault/items", {
    method,
    headers,
  });
}

describe("assertSameOrigin", () => {
  it("ignores safe methods", () => {
    expect(() =>
      assertSameOrigin(
        request("GET", { host: "api.example", origin: "http://evil.example" }),
      ),
    ).not.toThrow();
  });

  it("allows a same-origin write", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", { host: "api.example", origin: "http://api.example" }),
      ),
    ).not.toThrow();
  });

  it("allows a request with no Origin, which a CLI or test sends", () => {
    expect(() =>
      assertSameOrigin(request("POST", { host: "api.example" })),
    ).not.toThrow();
  });

  it("blocks a cross-origin write", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", { host: "api.example", origin: "http://evil.example" }),
      ),
    ).toThrow(/Cross-origin/);
  });

  it("blocks a cross-site fetch even when the host happens to match", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "api.example",
          origin: "http://api.example",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toThrow(/Cross-site/);
  });

  it("trusts an explicitly listed origin", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", { host: "api.example", origin: "http://app.example" }),
        ["http://app.example"],
      ),
    ).not.toThrow();
  });

  it("does not treat a browser extension origin as trusted by default", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", {
          host: "api.example",
          origin: "chrome-extension://abcdefghijklmnop",
        }),
      ),
    ).toThrow(/Cross-origin/);
  });

  it("requires a host header before trusting an origin comparison", () => {
    expect(() =>
      assertSameOrigin(request("POST", { origin: "http://app.example" })),
    ).toThrow(/Missing host header/);
  });
});
