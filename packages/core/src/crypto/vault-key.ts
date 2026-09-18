import type { KdfParams } from "@ahaai/db/schema";
import { authHashFromMasterKey, splitMasterKey } from "./split";
import { open, seal } from "./aead";
import { bytesToHex, randomBytes } from "./encoding";
import { CryptoError } from "./errors";
import { deriveMasterKey } from "./kdf";

export const VAULT_KEY_BYTES = 32;

export interface UnlockedVault {
  masterKey: Uint8Array;
  encKey: Uint8Array;
  authHash: string;
  vaultKey: Uint8Array;
}

export interface RegistrationMaterial {
  authHash: string;
  protectedVaultKey: string;
  vaultKey: Uint8Array;
  kdfParams: KdfParams;
}

/**
 * AAD ties the wrapped vault key to a stable account identifier so an envelope
 * cannot be replayed onto a different account. Callers should pass the
 * normalized email, which the client knows before registration completes.
 */
export function vaultKeyAad(binding: string): string {
  return `ahaai:vault-key:v1:${binding}`;
}

export function generateVaultKey(): Uint8Array {
  return randomBytes(VAULT_KEY_BYTES);
}

export function wrapVaultKey(
  vaultKey: Uint8Array,
  encKey: Uint8Array,
  binding: string,
): string {
  if (vaultKey.length !== VAULT_KEY_BYTES) {
    throw new CryptoError("INVALID_KEY", "Vault key must be 32 bytes");
  }
  return seal(encKey, vaultKey, vaultKeyAad(binding));
}

export function unwrapVaultKey(
  envelope: string,
  encKey: Uint8Array,
  binding: string,
): Uint8Array {
  const vaultKey = open(encKey, envelope, vaultKeyAad(binding));
  if (vaultKey.length !== VAULT_KEY_BYTES) {
    throw new CryptoError("INVALID_KEY", "Unwrapped vault key has the wrong length");
  }
  return vaultKey;
}

/**
 * Client-side registration: derives the master key, generates a random vault
 * key, and returns everything the server needs (never the encryption key).
 */
export async function buildRegistrationMaterial(
  password: string,
  kdfParams: KdfParams,
  binding: string,
): Promise<RegistrationMaterial> {
  const masterKey = await deriveMasterKey(password, kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  const vaultKey = generateVaultKey();
  return {
    authHash: authHashFromMasterKey(masterKey),
    protectedVaultKey: wrapVaultKey(vaultKey, encKey, binding),
    vaultKey,
    kdfParams,
  };
}

/**
 * Client-side unlock: re-derives keys from the password and unwraps the vault
 * key. GCM tag verification means a failed unwrap is a wrong-password signal.
 */
export async function unlockVault(
  password: string,
  kdfParams: KdfParams,
  protectedVaultKey: string,
  binding: string,
): Promise<UnlockedVault> {
  const masterKey = await deriveMasterKey(password, kdfParams);
  const { authKey, encKey } = splitMasterKey(masterKey);
  const vaultKey = unwrapVaultKey(protectedVaultKey, encKey, binding);
  return {
    masterKey,
    encKey,
    authHash: bytesToHex(authKey),
    vaultKey,
  };
}

/** Re-wraps the existing vault key under a new master password. */
export async function rewrapVaultKey(
  vaultKey: Uint8Array,
  newPassword: string,
  kdfParams: KdfParams,
  binding: string,
): Promise<{ authHash: string; protectedVaultKey: string }> {
  const masterKey = await deriveMasterKey(newPassword, kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  return {
    authHash: authHashFromMasterKey(masterKey),
    protectedVaultKey: wrapVaultKey(vaultKey, encKey, binding),
  };
}
