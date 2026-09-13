import { describe, expect, it } from "vitest";
import { bytesToHex, constantTimeEqual, randomBytes, utf8ToBytes } from "./encoding";
import { CryptoError } from "./errors";
import {
  AUTH_HASH_RE,
  authHashFromMasterKey,
  isValidAuthHash,
  splitMasterKey,
} from "./split";

describe("splitMasterKey", () => {
  it("is deterministic and produces distinct subkeys", () => {
    const masterKey = randomBytes(32);
    const first = splitMasterKey(masterKey);
    const second = splitMasterKey(masterKey);

    expect(Array.from(first.authKey)).toEqual(Array.from(second.authKey));
    expect(Array.from(first.encKey)).toEqual(Array.from(second.encKey));
    expect(first.authKey).toHaveLength(32);
    expect(first.encKey).toHaveLength(32);
    expect(constantTimeEqual(first.authKey, first.encKey)).toBe(false);
  });

  it("produces different subkeys for different master keys", () => {
    const a = splitMasterKey(randomBytes(32));
    const b = splitMasterKey(randomBytes(32));
    expect(bytesToHex(a.authKey)).not.toBe(bytesToHex(b.authKey));
    expect(bytesToHex(a.encKey)).not.toBe(bytesToHex(b.encKey));
  });

  it("rejects a wrong-size master key", () => {
    expect(() => splitMasterKey(randomBytes(16))).toThrow(CryptoError);
  });
});

describe("auth hash", () => {
  it("emits a 64-character hex hash accepted by the server validator", () => {
    const hash = authHashFromMasterKey(randomBytes(32));
    expect(hash).toMatch(AUTH_HASH_RE);
    expect(hash).toHaveLength(64);
    expect(isValidAuthHash(hash)).toBe(true);
  });

  it("rejects malformed hashes", () => {
    expect(isValidAuthHash("")).toBe(false);
    expect(isValidAuthHash("XYZ")).toBe(false);
    expect(isValidAuthHash("f".repeat(63))).toBe(false);
    expect(isValidAuthHash(utf8ToBytes("x"))).toBe(false);
  });
});
