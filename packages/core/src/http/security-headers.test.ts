import { describe, expect, it } from "vitest";
import { securityHeaders } from "@ahaai/core/http/security-headers";

describe("securityHeaders", () => {
  it("sets the core security headers", () => {
    const headers = securityHeaders();

    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("disallows framing and object embedding in the CSP", () => {
    const csp = securityHeaders()["Content-Security-Policy"];
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it("only emits HSTS when the deployment is served over HTTPS", () => {
    expect(securityHeaders()["Strict-Transport-Security"]).toBeUndefined();
    expect(
      securityHeaders({ isSecure: true })["Strict-Transport-Security"],
    ).toContain("max-age=");
  });

  it("allows eval for React only in development", () => {
    expect(
      securityHeaders({ isDevelopment: true })["Content-Security-Policy"],
    ).toContain("'unsafe-eval'");
    expect(
      securityHeaders({ isDevelopment: false })["Content-Security-Policy"],
    ).not.toContain("'unsafe-eval'");
  });

  it("widens connect-src to the configured client origins", () => {
    const csp = securityHeaders({
      connectSrc: ["'self'", "chrome-extension://abcdefghijklmnop"],
    })["Content-Security-Policy"];

    expect(csp).toContain(
      "connect-src 'self' chrome-extension://abcdefghijklmnop",
    );
  });

  it("relaxes the resource policy only when cross-origin clients exist", () => {
    expect(securityHeaders()["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(
      securityHeaders({ crossOriginResourcePolicy: "cross-origin" })[
        "Cross-Origin-Resource-Policy"
      ],
    ).toBe("cross-origin");
  });
});
