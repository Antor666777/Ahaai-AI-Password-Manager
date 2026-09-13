import { gcm } from "@noble/ciphers/aes.js";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  randomBytes,
  toBytes,
  utf8ToBytes,
} from "./encoding";
import { CryptoError } from "./errors";

export const ENVELOPE_VERSION = "v1";
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export type Aad = Uint8Array | string | undefined;

function normalizeKey(key: Uint8Array): Uint8Array {
  if (key.length !== KEY_BYTES) {
    throw new CryptoError("INVALID_KEY", "Key must be 32 bytes");
  }
  return key;
}

/**
 * Encrypts `plaintext` with AES-256-GCM and returns a versioned envelope:
 * `v1.<base64 nonce>.<base64 ciphertext+tag>`.
 */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad?: Aad): string {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = gcm(normalizeKey(key), nonce, aad ? toBytes(aad) : undefined).encrypt(
    plaintext,
  );
  return [
    ENVELOPE_VERSION,
    bytesToBase64(nonce),
    bytesToBase64(ciphertext),
  ].join(".");
}

export function open(key: Uint8Array, envelope: string, aad?: Aad): Uint8Array {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) {
    throw new CryptoError("INVALID_ENVELOPE", "Malformed envelope");
  }

  let nonce: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    nonce = base64ToBytes(parts[1]);
    ciphertext = base64ToBytes(parts[2]);
  } catch {
    throw new CryptoError("INVALID_ENVELOPE", "Envelope is not valid base64");
  }

  if (nonce.length !== NONCE_BYTES || ciphertext.length < 16) {
    throw new CryptoError("INVALID_ENVELOPE", "Envelope length is invalid");
  }

  try {
    return gcm(
      normalizeKey(key),
      nonce,
      aad ? toBytes(aad) : undefined,
    ).decrypt(ciphertext);
  } catch {
    throw new CryptoError("DECRYPT_FAILED", "Decryption failed");
  }
}

export function sealJson(key: Uint8Array, value: unknown, aad?: Aad): string {
  return seal(key, utf8ToBytes(JSON.stringify(value)), aad);
}

export function openJson<T>(key: Uint8Array, envelope: string, aad?: Aad): T {
  const bytes = open(key, envelope, aad);
  try {
    return JSON.parse(bytesToUtf8(bytes)) as T;
  } catch {
    throw new CryptoError("DECRYPT_FAILED", "Decrypted payload is not valid JSON");
  }
}

export function sealString(key: Uint8Array, value: string, aad?: Aad): string {
  return seal(key, utf8ToBytes(value), aad);
}

export function openString(key: Uint8Array, envelope: string, aad?: Aad): string {
  return bytesToUtf8(open(key, envelope, aad));
}
