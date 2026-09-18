import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDevDatabase, isDevDatabaseEnabled } from "./dev-client";

const KEYS = ["NODE_ENV", "DATABASE_URL", "AHAALI_ALLOW_EMBEDDED_DB"] as const;
const originals = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setEnv(key: (typeof KEYS)[number], value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

afterEach(() => {
  for (const key of KEYS) setEnv(key, originals[key]);
});

describe("isDevDatabaseEnabled", () => {
  it("is off whenever DATABASE_URL is set", () => {
    setEnv("DATABASE_URL", "postgres://localhost/ahaai");
    setEnv("AHAALI_ALLOW_EMBEDDED_DB", "1");
    setEnv("NODE_ENV", "development");
    expect(isDevDatabaseEnabled()).toBe(false);
  });

  it("needs the opt-in flag or a development NODE_ENV", () => {
    setEnv("DATABASE_URL", undefined);
    setEnv("AHAALI_ALLOW_EMBEDDED_DB", undefined);
    setEnv("NODE_ENV", "test");
    expect(isDevDatabaseEnabled()).toBe(false);

    setEnv("NODE_ENV", "development");
    expect(isDevDatabaseEnabled()).toBe(true);
  });
});

describe("bootstrapDevDatabase", () => {
  it("refuses to boot the embedded database in production", async () => {
    // A stray flag in a real deployment must not quietly serve traffic from a
    // file on the host when DATABASE_URL was forgotten.
    setEnv("DATABASE_URL", undefined);
    setEnv("AHAALI_ALLOW_EMBEDDED_DB", "1");
    setEnv("NODE_ENV", "production");

    await expect(bootstrapDevDatabase()).rejects.toThrow(/production/);
  });
});
