import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../proxy";

function run(path = "/api/health") {
  return proxy(new NextRequest(`http://localhost:3000${path}`));
}

describe("proxy security headers", () => {
  it("sets the core security headers", () => {
    const response = run();

    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("disallows framing and object embedding in the CSP", () => {
    const csp = run().headers.get("content-security-policy") ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("excludes static assets from the matcher", () => {
    const matcher = Array.isArray(config.matcher)
      ? config.matcher.join(" ")
      : config.matcher;
    expect(matcher).toContain("_next/static");
    expect(matcher).toContain("_next/image");
    expect(matcher).toContain("favicon.ico");
  });
});
