import { describe, expect, it } from "vitest";
import { deriveMasterKey } from "@ahaai/core/crypto/kdf";
import { splitMasterKey } from "@ahaai/core/crypto/split";
import { generateVaultKey, unwrapVaultKey } from "@ahaai/core/crypto/vault-key";
import { cheapKdfParams } from "@ahaai/testing/helpers/crypto";
import { rewrapForNewEmail } from "./crypto";

describe("rewrapForNewEmail", () => {
  it("re-wraps the same vault key so it opens only under the new address", async () => {
    const password = "tidal mocha lantern velvet";
    const kdfParams = cheapKdfParams();
    const vaultKey = generateVaultKey();

    const { protectedVaultKey } = await rewrapForNewEmail(
      vaultKey,
      password,
      "New.Address@Example.com",
      kdfParams,
    );

    const { encKey } = splitMasterKey(await deriveMasterKey(password, kdfParams));

    // The binding is normalized, so the address opens it whatever its case.
    const opened = unwrapVaultKey(
      protectedVaultKey,
      encKey,
      "new.address@example.com",
    );
    expect(Array.from(opened)).toEqual(Array.from(vaultKey));

    // The whole point of the re-wrap: the old address no longer opens it.
    expect(() =>
      unwrapVaultKey(protectedVaultKey, encKey, "old.address@example.com"),
    ).toThrow();
  });
});
