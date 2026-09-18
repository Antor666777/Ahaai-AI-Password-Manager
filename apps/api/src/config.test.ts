import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseOrigins } from "./config";

const PEPPER = "a".repeat(32);
const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");

function baseEnv(): Record<string, string | undefined> {
  return {
    AUTH_PEPPER: PEPPER,
    ENCRYPTION_MASTER_KEY: MASTER_KEY,
  };
}

describe("loadConfig", () => {
  it("applies documented defaults", () => {
    const config = loadConfig(baseEnv());

    expect(config.port).toBe(3001);
    expect(config.sessionTtlDays).toBe(30);
    expect(config.trustProxy).toBe(true);
    expect(config.cookieSecure).toBeUndefined();
    expect(config.corsAllowedOrigins).toEqual([]);
    expect(config.serveStatic).toBe(false);
    expect(config.isProduction).toBe(false);
  });

  it("names the missing variable and how to generate it", () => {
    let caught: unknown;
    try {
      loadConfig({ ENCRYPTION_MASTER_KEY: MASTER_KEY });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConfigError);
    const message = (caught as Error).message;
    expect(message).toContain("AUTH_PEPPER");
    expect(message).toContain("randomBytes(32)");
    expect(message).toContain(".env.example");
  });

  it("rejects a master key that is not 32 bytes of base64", () => {
    expect(() =>
      loadConfig({ ...baseEnv(), ENCRYPTION_MASTER_KEY: "tooshort" }),
    ).toThrow(/ENCRYPTION_MASTER_KEY must be exactly 32 bytes/);
  });

  it("parses a comma-separated origin allowlist", () => {
    const config = loadConfig({
      ...baseEnv(),
      CORS_ALLOWED_ORIGINS: " chrome-extension://abc , https://app.example ,",
    });

    expect(config.corsAllowedOrigins).toEqual([
      "chrome-extension://abc",
      "https://app.example",
    ]);
  });

  it("reads the explicit opt-in flags rather than guessing from NODE_ENV", () => {
    const config = loadConfig({
      ...baseEnv(),
      NODE_ENV: "production",
      COOKIE_SECURE: "false",
      TRUST_PROXY: "0",
      SERVE_STATIC: "1",
    });

    expect(config.isProduction).toBe(true);
    expect(config.cookieSecure).toBe(false);
    expect(config.trustProxy).toBe(false);
    expect(config.serveStatic).toBe(true);
  });
});

describe("parseOrigins", () => {
  it("drops blank entries", () => {
    expect(parseOrigins("  , https://a.example ,, ")).toEqual([
      "https://a.example",
    ]);
  });
});
