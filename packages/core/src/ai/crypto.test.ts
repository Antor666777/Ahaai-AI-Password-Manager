import { afterEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./crypto";

describe("provider key encryption", () => {
  const original = process.env.ENCRYPTION_MASTER_KEY;

  afterEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = original;
  });

  it("round-trips a key and never stores it in plaintext", () => {
    const plaintext = "sk-live-1234567890abcdef";
    const envelope = encryptApiKey(plaintext);

    expect(envelope.startsWith("v1.")).toBe(true);
    expect(envelope).not.toContain(plaintext);
    expect(decryptApiKey(envelope)).toBe(plaintext);
  });

  it("produces a different envelope each time", () => {
    expect(encryptApiKey("same-key")).not.toBe(encryptApiKey("same-key"));
  });

  it("masks all but the last four characters", () => {
    expect(maskApiKey("sk-live-1234567890abcd")).toBe("********abcd");
    expect(maskApiKey("abc")).toBe("********");
  });

  it("fails to decrypt with a different master key", () => {
    const envelope = encryptApiKey("secret-key");
    process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptApiKey(envelope)).toThrow();
  });

  it("throws when the master key is missing or the wrong size", () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => encryptApiKey("x")).toThrow();

    process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptApiKey("x")).toThrow();
  });
});
