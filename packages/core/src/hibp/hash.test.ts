import { describe, expect, it } from "vitest";
import { sha1HexUpper, sha256Hex } from "./hash";

/**
 * Known digests for "password". The range prefix derived from the SHA-1 value
 * (5BAA6) is the one the Pwned Passwords API expects, so a wrong digest here
 * would quietly defeat the whole breach check.
 */
describe("sha1HexUpper", () => {
  it("matches the published SHA-1 of a known input", () => {
    expect(sha1HexUpper("password")).toBe(
      "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8",
    );
  });

  it("is upper-case and 40 characters", () => {
    const hash = sha1HexUpper("correct horse battery staple");
    expect(hash).toHaveLength(40);
    expect(hash).toBe(hash.toUpperCase());
  });

  it("is stable and distinct per input", () => {
    expect(sha1HexUpper("alpha")).toBe(sha1HexUpper("alpha"));
    expect(sha1HexUpper("alpha")).not.toBe(sha1HexUpper("beta"));
  });

  it("hashes the empty string without throwing", () => {
    expect(sha1HexUpper("")).toBe(
      "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709",
    );
  });
});

describe("sha256Hex", () => {
  it("matches the published SHA-256 of a known input", () => {
    expect(sha256Hex("password")).toBe(
      "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    );
  });

  it("is 64 lower-case hex characters", () => {
    const hash = sha256Hex("correct horse battery staple");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hash.toLowerCase());
  });
});
