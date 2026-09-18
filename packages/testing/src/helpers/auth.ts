import { buildRegistrationMaterial } from "@ahaai/core/crypto/vault-key";
import { deriveMasterKey } from "@ahaai/core/crypto/kdf";
import { authHashFromMasterKey } from "@ahaai/core/crypto/split";
import { normalizeEmail, registerUser } from "@ahaai/core/auth/service";
import type { KdfParams } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { cheapKdfParams } from "./crypto";

export const TEST_PASSWORD = "tidal mocha lantern velvet";

/** Client-side derivation of the auth hash for a password. */
export async function deriveAuthHash(
  password: string,
  kdfParams: KdfParams,
): Promise<string> {
  return authHashFromMasterKey(await deriveMasterKey(password, kdfParams));
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  authHash: string;
  protectedVaultKey: string;
  kdfParams: KdfParams;
  vaultKey: Uint8Array;
  token: string;
}

export interface CreateTestUserOptions {
  email?: string;
  password?: string;
  kdfParams?: KdfParams;
}

/**
 * Registers a fully-formed user through the real crypto + service path, so
 * tests exercise the same flow a browser client would.
 */
export async function createTestUser(
  db: Database,
  options: CreateTestUserOptions = {},
): Promise<TestUser> {
  const email = options.email ?? "ada@example.com";
  const password = options.password ?? TEST_PASSWORD;
  const kdfParams = options.kdfParams ?? cheapKdfParams();

  const material = await buildRegistrationMaterial(
    password,
    kdfParams,
    normalizeEmail(email),
  );

  const result = await registerUser(db, {
    email,
    authHash: material.authHash,
    kdfParams,
    protectedVaultKey: material.protectedVaultKey,
  });

  return {
    id: result.user.id,
    email,
    password,
    authHash: material.authHash,
    protectedVaultKey: material.protectedVaultKey,
    kdfParams,
    vaultKey: material.vaultKey,
    token: result.token,
  };
}
