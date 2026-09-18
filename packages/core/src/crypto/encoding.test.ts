import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  bytesToUtf8,
  constantTimeEqual,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from "./encoding";

describe("encoding", () => {
  it("round-trips base64 for many lengths", () => {
    for (const length of [0, 1, 2, 3, 4, 15, 16, 31, 32, 255, 1024]) {
      const bytes = randomBytes(length);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
        Array.from(bytes),
      );
    }
  });

  it("encodes a known base64 vector", () => {
    expect(bytesToBase64(Uint8Array.from([0, 1, 2, 3]))).toBe("AAECAw==");
  });

  it("produces unpadded URL-safe base64", () => {
    const encoded = bytesToBase64Url(randomBytes(16));
    expect(encoded).toHaveLength(22);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("round-trips hex", () => {
    const bytes = randomBytes(32);
    expect(Array.from(hexToBytes(bytesToHex(bytes)))).toEqual(Array.from(bytes));
  });

  it("round-trips utf8", () => {
    const text = "correct horse battery staple \u00e9\u00f1";
    expect(bytesToUtf8(utf8ToBytes(text))).toBe(text);
  });

  it("compares constant-time", () => {
    const a = Uint8Array.from([1, 2, 3]);
    expect(constantTimeEqual(a, Uint8Array.from([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(a, Uint8Array.from([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(a, Uint8Array.from([1, 2]))).toBe(false);
  });
});
