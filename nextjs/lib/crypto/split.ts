import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "./encoding";
import { CryptoError } from "./errors";

const AUTH_INFO = utf8ToBytes("ahaai:auth:v1");
const ENC_INFO = utf8ToBytes("ahaai:enc:v1");

export const SUBKEY_BYTES = 32;
export const AUTH_HASH_HEX_LENGTH = SUBKEY_BYTES * 2;
export const AUTH_HASH_RE = /^[0-9a-f]{64}$/;

export interface SplitKeys {
  /** Sent to the server for authentication. Not usable to decrypt anything. */
  authKey: Uint8Array;
  /** Never leaves the device; unwraps the user's vault key. */
  encKey: Uint8Array;
}

/**
 * Splits a 32-byte master key into two independent subkeys via HKDF-SHA256.
 * This is the "hash vs encryption key" split: the auth key is safe to transmit,
 * the encryption key is not.
 */
export function splitMasterKey(masterKey: Uint8Array): SplitKeys {
  if (masterKey.length !== 32) {
    throw new CryptoError("INVALID_KEY", "Master key must be 32 bytes");
  }

  const authKey = hkdf(sha256, masterKey, undefined, AUTH_INFO, SUBKEY_BYTES);
  const encKey = hkdf(sha256, masterKey, undefined, ENC_INFO, SUBKEY_BYTES);
  return { authKey, encKey };
}

export function authHashFromMasterKey(masterKey: Uint8Array): string {
  return bytesToHex(splitMasterKey(masterKey).authKey);
}

export function encKeyFromMasterKey(masterKey: Uint8Array): Uint8Array {
  return splitMasterKey(masterKey).encKey;
}

export function isValidAuthHash(value: unknown): value is string {
  return typeof value === "string" && AUTH_HASH_RE.test(value);
}
