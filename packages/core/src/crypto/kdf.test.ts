import { describe, expect, it } from "vitest";
import { cheapKdfParams } from "@ahaai/testing/helpers/crypto";
import { bytesToHex } from "./encoding";
import { CryptoError } from "./errors";
import { deriveMasterKey, validateKdfParams } from "./kdf";

describe("deriveMasterKey", () => {
  it("derives a deterministic 32-byte key", async () => {
    const params = cheapKdfParams();
    const a = await deriveMasterKey("hunter2-hunter2", params);
    const b = await deriveMasterKey("hunter2-hunter2", params);
    expect(a).toHaveLength(32);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it("changes with the password", async () => {
    const params = cheapKdfParams();
    const a = await deriveMasterKey("password-one", params);
    const b = await deriveMasterKey("password-two", params);
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it("changes with the salt", async () => {
    const a = await deriveMasterKey("same-password", cheapKdfParams());
    const b = await deriveMasterKey("same-password", cheapKdfParams());
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it("rejects an empty password", async () => {
    await expect(deriveMasterKey("", cheapKdfParams())).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
    });
  });
});

describe("validateKdfParams", () => {
  it("accepts valid params", () => {
    expect(() => validateKdfParams(cheapKdfParams())).not.toThrow();
  });

  it("rejects out-of-range cost parameters", () => {
    expect(() => validateKdfParams(cheapKdfParams({ memoryKiB: 1 }))).toThrow(
      CryptoError,
    );
    expect(() => validateKdfParams(cheapKdfParams({ iterations: 99 }))).toThrow(
      CryptoError,
    );
    expect(() => validateKdfParams(cheapKdfParams({ parallelism: 0 }))).toThrow(
      CryptoError,
    );
  });

  it("rejects unknown algorithms and versions", () => {
    expect(() =>
      validateKdfParams(cheapKdfParams({ algo: "scrypt" as never })),
    ).toThrow(CryptoError);
    expect(() => validateKdfParams(cheapKdfParams({ version: 2 }))).toThrow(
      CryptoError,
    );
  });

  it("rejects a short or malformed salt", () => {
    expect(() => validateKdfParams(cheapKdfParams({ salt: "AAAA" }))).toThrow(
      CryptoError,
    );
    expect(() => validateKdfParams(cheapKdfParams({ salt: "not base64!!" }))).toThrow(
      CryptoError,
    );
  });
});
