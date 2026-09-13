import { argon2idAsync } from "@noble/hashes/argon2.js";
import type { ServerAuthParams } from "@/lib/db/schema";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  constantTimeEqual,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from "@/lib/crypto/encoding";
import { CryptoError } from "@/lib/crypto/errors";
import { isValidAuthHash } from "@/lib/crypto/split";

/** Server-side hashing of the client auth hash. Independent of client KDF params. */
export const SERVER_AUTH_PARAMS: ServerAuthParams = {
  algo: "argon2id",
  memoryKiB: 19456,
  iterations: 2,
  parallelism: 1,
};

export const AUTH_SALT_BYTES = 16;

function pepper(): Uint8Array {
  const value = process.env.AUTH_PEPPER;
  if (!value || value.length < 16) {
    throw new CryptoError(
      "INVALID_PARAMS",
      "AUTH_PEPPER must be set to at least 16 characters",
    );
  }
  return utf8ToBytes(value);
}

export function generateAuthSalt(): string {
  return bytesToBase64(randomBytes(AUTH_SALT_BYTES));
}

/**
 * Hashes the client-provided auth hash with a per-user salt and a server-side
 * pepper (mixed in as an Argon2 secret). The result is what we store.
 */
export async function hashAuthHash(
  authHash: string,
  saltBase64: string,
  params: ServerAuthParams = SERVER_AUTH_PARAMS,
): Promise<string> {
  if (!isValidAuthHash(authHash)) {
    throw new CryptoError("INVALID_PARAMS", "Auth hash must be 64 hex characters");
  }

  let salt: Uint8Array;
  try {
    salt = base64ToBytes(saltBase64);
  } catch {
    throw new CryptoError("INVALID_PARAMS", "Auth salt is not valid base64");
  }
  if (salt.length < AUTH_SALT_BYTES) {
    throw new CryptoError("INVALID_PARAMS", "Auth salt is too short");
  }

  const derived = await argon2idAsync(hexToBytes(authHash), salt, {
    t: params.iterations,
    m: params.memoryKiB,
    p: params.parallelism,
    dkLen: 32,
    key: pepper(),
  });

  return bytesToHex(derived);
}

export async function verifyAuthHash(
  authHash: string,
  saltBase64: string,
  expectedHash: string,
  params: ServerAuthParams = SERVER_AUTH_PARAMS,
): Promise<boolean> {
  const actual = await hashAuthHash(authHash, saltBase64, params);
  return constantTimeEqual(hexToBytes(actual), hexToBytes(expectedHash));
}

/**
 * Performs a throwaway hash so unknown-user logins take a similar amount of
 * time as known-user logins, blunting user enumeration via timing.
 */
export async function dummyVerify(authHash: string): Promise<void> {
  try {
    await hashAuthHash(
      isValidAuthHash(authHash) ? authHash : "0".repeat(64),
      bytesToBase64(randomBytes(AUTH_SALT_BYTES)),
    );
  } catch {
    // Intentionally ignored: this only burns time.
  }
}
