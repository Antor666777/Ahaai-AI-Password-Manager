import { describe, expect, it } from "vitest";
import {
  MIN_MASTER_PASSWORD_LENGTH,
  evaluateMasterPassword,
  isStrongMasterPassword,
} from "./password-policy";

describe("evaluateMasterPassword", () => {
  it("rejects short passwords", () => {
    const result = evaluateMasterPassword("abc123");
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("rejects common passwords", () => {
    expect(isStrongMasterPassword("password123")).toBe(false);
    expect(isStrongMasterPassword("correcthorsebatterystaple")).toBe(false);
  });

  it("rejects repeated characters", () => {
    const result = evaluateMasterPassword("aaaaaaaaaaaaaa");
    expect(result.ok).toBe(false);
  });

  it("rejects passwords containing the email local part", () => {
    const result = evaluateMasterPassword("adamantium-secret-pass", {
      email: "adamantium@example.com",
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("Do not include your email address");
  });

  it("accepts strong passphrases", () => {
    const result = evaluateMasterPassword("tidal mocha lantern velvet");
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("accepts long mixed passwords", () => {
    expect(
      evaluateMasterPassword("Tr0ub4dour&3xtra-Long-Value!").ok,
    ).toBe(true);
  });

  it("enforces the documented minimum length", () => {
    const justShort = "a1B!".repeat(2); // 8 chars
    expect(justShort.length).toBeLessThan(MIN_MASTER_PASSWORD_LENGTH);
    expect(evaluateMasterPassword(justShort).ok).toBe(false);
  });
});
