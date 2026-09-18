import { describe, expect, it } from "vitest";
import { corsHeaders, matchOrigin } from "@ahaai/core/http/cors";

const EXTENSION = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

describe("matchOrigin", () => {
  it("matches exact origins, trailing-wildcard prefixes and the bare wildcard", () => {
    expect(matchOrigin("https://app.example", ["https://app.example"])).toBe(true);
    expect(matchOrigin("https://app.example", ["https://other.example"])).toBe(false);
    expect(matchOrigin(EXTENSION, ["chrome-extension://*"])).toBe(true);
    expect(matchOrigin("https://anything.example", ["*"])).toBe(true);
  });

  it("does not treat a prefix match as a suffix or substring match", () => {
    expect(matchOrigin("https://evil.example/app", ["https://app.example*"])).toBe(
      false,
    );
  });
});

describe("corsHeaders", () => {
  it("echoes an explicitly allowed origin and permits credentials", () => {
    const headers = corsHeaders(EXTENSION, [EXTENSION]);

    expect(headers["Access-Control-Allow-Origin"]).toBe(EXTENSION);
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers.Vary).toBe("Origin");
  });

  it("allows credentials for a prefix match but still echoes the origin", () => {
    const headers = corsHeaders(EXTENSION, ["chrome-extension://*"]);

    expect(headers["Access-Control-Allow-Origin"]).toBe(EXTENSION);
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("never pairs a wildcard origin with credentials", () => {
    const headers = corsHeaders("https://any.example", ["*"]);

    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("omits allow-origin for a disallowed origin", () => {
    const headers = corsHeaders("https://evil.example", [EXTENSION]);

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers.Vary).toBe("Origin");
  });

  it("advertises the methods and headers clients need, even without an origin", () => {
    const headers = corsHeaders(null, []);

    expect(headers["Access-Control-Allow-Methods"]).toContain("PATCH");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });
});
