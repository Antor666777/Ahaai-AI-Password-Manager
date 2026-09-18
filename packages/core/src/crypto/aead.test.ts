import { describe, expect, it } from "vitest";
import {
  ENVELOPE_VERSION,
  open,
  openJson,
  openString,
  seal,
  sealJson,
  sealString,
} from "./aead";
import {
  bytesToBase64,
  base64ToBytes,
  bytesToUtf8,
  randomBytes,
  utf8ToBytes,
} from "./encoding";
import { CryptoError } from "./errors";

const key = randomBytes(32);

describe("seal/open", () => {
  it("round-trips bytes", () => {
    const plaintext = randomBytes(100);
    const envelope = seal(key, plaintext);
    expect(Array.from(open(key, envelope))).toEqual(Array.from(plaintext));
  });

  it("uses a versioned three-part envelope with a fresh nonce", () => {
    const first = seal(key, utf8ToBytes("same"));
    const second = seal(key, utf8ToBytes("same"));
    expect(first.split(".")).toHaveLength(3);
    expect(first.startsWith(`${ENVELOPE_VERSION}.`)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("binds ciphertext to the AAD", () => {
    const envelope = seal(key, utf8ToBytes("secret"), "item:123");
    expect(bytesToUtf8(open(key, envelope, "item:123"))).toBe("secret");
    expect(() => open(key, envelope, "item:456")).toThrow(CryptoError);
    expect(() => open(key, envelope)).toThrow(CryptoError);
  });

  it("fails on the wrong key", () => {
    const envelope = seal(key, utf8ToBytes("secret"));
    expect(() => open(randomBytes(32), envelope)).toThrow(CryptoError);
  });

  it("detects tampering", () => {
    const envelope = seal(key, utf8ToBytes("secret"));
    const [version, nonce, ciphertext] = envelope.split(".");
    const tamperedBytes = base64ToBytes(ciphertext);
    tamperedBytes[0] ^= 0xff;
    const tampered = `${version}.${nonce}.${bytesToBase64(tamperedBytes)}`;
    expect(() => open(key, tampered)).toThrow(CryptoError);
  });

  it("rejects malformed envelopes", () => {
    expect(errorCode(() => open(key, "not-an-envelope"))).toBe("INVALID_ENVELOPE");
    expect(errorCode(() => open(key, "v2.aaaa.bbbb"))).toBe("INVALID_ENVELOPE");
    expect(() => open(key, "v1.!!!.!!!")).toThrow(CryptoError);
  });

  it("rejects an invalid key length", () => {
    expect(errorCode(() => seal(randomBytes(16), utf8ToBytes("x")))).toBe(
      "INVALID_KEY",
    );
  });
});

describe("string and JSON helpers", () => {
  it("round-trips strings", () => {
    const envelope = sealString(key, "hello world", "aad");
    expect(openString(key, envelope, "aad")).toBe("hello world");
  });

  it("round-trips JSON", () => {
    const value = { username: "ada", password: "s3cret", tags: ["a", "b"] };
    const envelope = sealJson(key, value, "item:1");
    expect(openJson(key, envelope, "item:1")).toEqual(value);
  });

  it("rejects decrypted payloads that are not valid JSON", () => {
    const envelope = seal(key, utf8ToBytes("not json"));
    expect(errorCode(() => openJson(key, envelope))).toBe("DECRYPT_FAILED");
  });
});

function errorCode(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error instanceof CryptoError ? error.code : error;
  }
  return undefined;
}
