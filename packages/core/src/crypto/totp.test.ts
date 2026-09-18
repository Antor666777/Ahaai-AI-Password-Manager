import { describe, expect, it } from "vitest";
import { utf8ToBytes } from "./encoding";
import {
  buildOtpauthUri,
  decodeBase32,
  generateTotp,
  normalizeBase32,
  parseOtpauthUri,
  TotpError,
  totpSecondsRemaining,
} from "./totp";

/**
 * RFC 6238 Appendix B uses a different ASCII key per algorithm: a 20 byte
 * seed for SHA-1 extended to 32 bytes for SHA-256 and 64 bytes for SHA-512.
 */
const SHA1_SECRET = utf8ToBytes("12345678901234567890");
const SHA256_SECRET = utf8ToBytes("12345678901234567890123456789012");
const SHA512_SECRET = utf8ToBytes(
  "1234567890123456789012345678901234567890123456789012345678901234",
);

type Vector = readonly [seconds: number, code: string];

// Appendix B reference values (all 8 digits, 30 second period).
const SHA1_VECTORS: Vector[] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

const SHA256_VECTORS: Vector[] = [
  [59, "46119246"],
  [1111111109, "68084774"],
  [1111111111, "67062674"],
  [1234567890, "91819424"],
  [2000000000, "90698825"],
  [20000000000, "77737706"],
];

const SHA512_VECTORS: Vector[] = [
  [59, "90693936"],
  [1111111109, "25091201"],
  [1111111111, "99943326"],
  [1234567890, "93441116"],
  [2000000000, "38618901"],
  [20000000000, "47863826"],
];

describe("generateTotp", () => {
  it("matches the RFC 6238 SHA-1 vectors", () => {
    for (const [seconds, code] of SHA1_VECTORS) {
      expect(generateTotp(SHA1_SECRET, { digits: 8, at: seconds })).toBe(code);
    }
  });

  it("matches the RFC 6238 SHA-256 vectors", () => {
    for (const [seconds, code] of SHA256_VECTORS) {
      expect(
        generateTotp(SHA256_SECRET, { digits: 8, algorithm: "SHA256", at: seconds }),
      ).toBe(code);
    }
  });

  it("matches the RFC 6238 SHA-512 vectors", () => {
    for (const [seconds, code] of SHA512_VECTORS) {
      expect(
        generateTotp(SHA512_SECRET, { digits: 8, algorithm: "SHA512", at: seconds }),
      ).toBe(code);
    }
  });

  it("defaults to six digits, seconds and SHA-1", () => {
    // Truncating the 8-digit reference value keeps the low six digits.
    expect(generateTotp(SHA1_SECRET, { at: 59 })).toBe("287082");
    expect(generateTotp(SHA1_SECRET, { at: 1234567890 })).toBe("005924");
  });

  it("accepts the base32 form of the secret", () => {
    const base32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(decodeBase32(base32)).toEqual(SHA1_SECRET);
    expect(generateTotp(base32, { at: 59 })).toBe("287082");
  });

  it("accepts a Date for the timestamp", () => {
    expect(generateTotp(SHA1_SECRET, { at: new Date(59_000) })).toBe("287082");
  });

  it("keeps the code stable inside a period and rotates at the boundary", () => {
    const first = generateTotp(SHA1_SECRET, { at: 30 });
    expect(generateTotp(SHA1_SECRET, { at: 59 })).toBe(first);
    expect(generateTotp(SHA1_SECRET, { at: 60 })).not.toBe(first);
  });

  it("honours a custom period", () => {
    // A 60 second period makes 30 and 59 share a window that 60 does not.
    const a = generateTotp(SHA1_SECRET, { period: 60, at: 30 });
    expect(generateTotp(SHA1_SECRET, { period: 60, at: 59 })).toBe(a);
    expect(generateTotp(SHA1_SECRET, { period: 60, at: 60 })).not.toBe(a);
  });

  it("rejects invalid parameters and secrets", () => {
    expect(() => generateTotp(SHA1_SECRET, { digits: 5 })).toThrow(TotpError);
    expect(() => generateTotp(SHA1_SECRET, { period: 0 })).toThrow(TotpError);
    expect(() => generateTotp(SHA1_SECRET, { algorithm: "MD5" as never })).toThrow(
      TotpError,
    );
    expect(() => generateTotp("not base32!")).toThrow(TotpError);
    expect(() => generateTotp(new Uint8Array(0))).toThrow(TotpError);
  });
});

describe("totpSecondsRemaining", () => {
  it("counts down within a period and resets on the boundary", () => {
    expect(totpSecondsRemaining(30, 0)).toBe(30);
    expect(totpSecondsRemaining(30, 1)).toBe(29);
    expect(totpSecondsRemaining(30, 29)).toBe(1);
    expect(totpSecondsRemaining(30, 30)).toBe(30);
    expect(totpSecondsRemaining(30, 59)).toBe(1);
    expect(totpSecondsRemaining(30, 60)).toBe(30);
  });

  it("honours a custom period and accepts a Date", () => {
    expect(totpSecondsRemaining(60, 0)).toBe(60);
    expect(totpSecondsRemaining(60, 45)).toBe(15);
    expect(totpSecondsRemaining(30, new Date(10_000))).toBe(20);
  });

  it("rejects a non-positive period", () => {
    expect(() => totpSecondsRemaining(0, 0)).toThrow(TotpError);
  });
});

describe("decodeBase32", () => {
  it("decodes a padded RFC 4648 vector", () => {
    expect(decodeBase32("MZXW6YTBOI======")).toEqual(utf8ToBytes("foobar"));
  });

  it("ignores spaces, padding and lower case", () => {
    const withSpacing = "mzxw 6ytb oi==";
    expect(decodeBase32(withSpacing)).toEqual(utf8ToBytes("foobar"));
    expect(normalizeBase32(withSpacing)).toBe("MZXW6YTBOI");
  });

  it("round-trips the RFC 6238 SHA-1 seed", () => {
    const encoded = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(normalizeBase32(encoded)).toBe(encoded);
    expect(decodeBase32(encoded)).toEqual(SHA1_SECRET);
  });

  it("rejects characters outside the alphabet", () => {
    for (const invalid of ["MZXW6YTBO1", "MZXW6YTBO8", "hello!", "MZXW=6YTB"]) {
      expect(() => decodeBase32(invalid)).toThrow(TotpError);
    }
    expect(() => decodeBase32("   ")).toThrow(TotpError);
  });
});

describe("parseOtpauthUri", () => {
  it("parses a full URI including issuer and custom parameters", () => {
    const params = parseOtpauthUri(
      "otpauth://totp/ACME%20Co:alice@example.com?secret=JBSWY3DPEHPK3PXP" +
        "&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60",
    );
    expect(params).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "ACME Co",
      account: "alice@example.com",
      digits: 8,
      period: 60,
      algorithm: "SHA256",
    });
  });

  it("falls back to the label issuer and default parameters", () => {
    const params = parseOtpauthUri("otpauth://totp/GitHub:octocat?secret=jbsWY3dpehpk3pxp");
    expect(params).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "GitHub",
      account: "octocat",
      digits: 6,
      period: 30,
      algorithm: "SHA1",
    });
  });

  it("tolerates a label with no issuer", () => {
    const params = parseOtpauthUri("otpauth://totp/alice@example.com?secret=JBSWY3DPEHPK3PXP");
    expect(params?.issuer).toBeUndefined();
    expect(params?.account).toBe("alice@example.com");
  });

  it("defaults odd or out-of-range parameters", () => {
    const params = parseOtpauthUri(
      "otpauth://totp/acct?secret=JBSWY3DPEHPK3PXP&digits=99&period=0&algorithm=MD5",
    );
    expect(params?.digits).toBe(6);
    expect(params?.period).toBe(30);
    expect(params?.algorithm).toBe("SHA1");
  });

  it("returns null for malformed or unsupported input", () => {
    expect(parseOtpauthUri("https://example.com/totp?secret=JBSWY3DPEHPK3PXP")).toBeNull();
    expect(parseOtpauthUri("otpauth://hotp/acct?secret=JBSWY3DPEHPK3PXP&counter=0")).toBeNull();
    expect(parseOtpauthUri("otpauth://totp/acct")).toBeNull();
    expect(parseOtpauthUri("otpauth://totp/acct?secret=not-base32!")).toBeNull();
    expect(parseOtpauthUri("not a uri at all")).toBeNull();
  });
});

describe("buildOtpauthUri", () => {
  it("omits default parameters so a plain secret stays readable", () => {
    expect(buildOtpauthUri({ secret: "jbsWY3dpehpk3pxp" })).toBe(
      "otpauth://totp/?secret=JBSWY3DPEHPK3PXP",
    );
  });

  it("keeps custom digits, period and algorithm", () => {
    const params = parseOtpauthUri(
      buildOtpauthUri({
        secret: "JBSWY3DPEHPK3PXP",
        issuer: "Acme",
        account: "alice",
        digits: 8,
        period: 60,
        algorithm: "SHA256",
      }),
    );
    expect(params).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Acme",
      account: "alice",
      digits: 8,
      period: 60,
      algorithm: "SHA256",
    });
  });

  it("round-trips parsed parameters through build and parse again", () => {
    const source =
      "otpauth://totp/Acme:alice?secret=JBSWY3DPEHPK3PXP&issuer=Acme&digits=8&period=60&algorithm=SHA512";
    const parsed = parseOtpauthUri(source);
    expect(parsed).not.toBeNull();
    expect(parseOtpauthUri(buildOtpauthUri(parsed!))).toEqual(parsed);
  });
});
