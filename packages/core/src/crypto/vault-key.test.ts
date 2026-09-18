import { describe, expect, it } from "vitest";
import { cheapKdfParams } from "@ahaai/testing/helpers/crypto";
import { randomBytes } from "./encoding";
import { CryptoError } from "./errors";
import {
  buildRegistrationMaterial,
  generateVaultKey,
  rewrapVaultKey,
  unwrapVaultKey,
  unlockVault,
  wrapVaultKey,
} from "./vault-key";
import { splitMasterKey } from "./split";

const userId = "11111111-1111-1111-1111-111111111111";

describe("vault key lifecycle", () => {
  it("generates unique 32-byte vault keys", () => {
    const a = generateVaultKey();
    const b = generateVaultKey();
    expect(a).toHaveLength(32);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("wraps and unwraps under the same user", () => {
    const vaultKey = generateVaultKey();
    const { encKey } = splitMasterKey(randomBytes(32));
    const envelope = wrapVaultKey(vaultKey, encKey, userId);
    expect(Array.from(unwrapVaultKey(envelope, encKey, userId))).toEqual(
      Array.from(vaultKey),
    );
  });

  it("fails to unwrap under a different user (AAD binding)", () => {
    const vaultKey = generateVaultKey();
    const { encKey } = splitMasterKey(randomBytes(32));
    const envelope = wrapVaultKey(vaultKey, encKey, userId);
    expect(() =>
      unwrapVaultKey(envelope, encKey, "22222222-2222-2222-2222-222222222222"),
    ).toThrow(CryptoError);
  });

  it("fails to unwrap under a different encryption key", () => {
    const vaultKey = generateVaultKey();
    const { encKey } = splitMasterKey(randomBytes(32));
    const otherKey = splitMasterKey(randomBytes(32)).encKey;
    const envelope = wrapVaultKey(vaultKey, encKey, userId);
    expect(() => unwrapVaultKey(envelope, otherKey, userId)).toThrow(CryptoError);
  });
});

describe("registration and unlock", () => {
  it("registers then unlocks with the same password", async () => {
    const kdfParams = cheapKdfParams();
    const password = "correct horse battery staple";
    const registration = await buildRegistrationMaterial(password, kdfParams, userId);

    expect(registration.authHash).toHaveLength(64);
    expect(registration.vaultKey).toHaveLength(32);

    const unlocked = await unlockVault(
      password,
      registration.kdfParams,
      registration.protectedVaultKey,
      userId,
    );

    expect(Array.from(unlocked.vaultKey)).toEqual(
      Array.from(registration.vaultKey),
    );
    expect(unlocked.authHash).toBe(registration.authHash);
  });

  it("fails to unlock with the wrong password", async () => {
    const kdfParams = cheapKdfParams();
    const registration = await buildRegistrationMaterial(
      "the right password",
      kdfParams,
      userId,
    );

    await expect(
      unlockVault(
        "the wrong password",
        registration.kdfParams,
        registration.protectedVaultKey,
        userId,
      ),
    ).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
  });

  it("re-wraps the same vault key for a new password", async () => {
    const registration = await buildRegistrationMaterial(
      "first password",
      cheapKdfParams(),
      userId,
    );

    const newParams = cheapKdfParams();
    const rotated = await rewrapVaultKey(
      registration.vaultKey,
      "second password",
      newParams,
      userId,
    );

    const unlocked = await unlockVault(
      "second password",
      newParams,
      rotated.protectedVaultKey,
      userId,
    );
    expect(Array.from(unlocked.vaultKey)).toEqual(
      Array.from(registration.vaultKey),
    );
    expect(unlocked.authHash).toBe(rotated.authHash);
  });
});
