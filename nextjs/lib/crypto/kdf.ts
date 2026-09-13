import { argon2idAsync } from "@noble/hashes/argon2.js";
import type { KdfParams } from "@/lib/db/schema";
import { base64ToBytes, bytesToBase64, randomBytes, utf8ToBytes } from "./encoding";
import { CryptoError } from "./errors";

export const KDF_VERSION = 1;
export const MASTER_KEY_BYTES = 32;
export const MIN_SALT_BYTES = 16;

export const DEFAULT_KDF_PARAMS = {
  algo: "argon2id",
  version: KDF_VERSION,
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
} as const satisfies Omit<KdfParams, "salt">;

const LIMITS = {
  memoryKiB: { min: 8192, max: 262144 },
  iterations: { min: 1, max: 10 },
  parallelism: { min: 1, max: 8 },
};

export function generateKdfParams(
  overrides: Partial<Omit<KdfParams, "salt">> = {},
): KdfParams {
  const params: KdfParams = {
    ...DEFAULT_KDF_PARAMS,
    ...overrides,
    salt: bytesToBase64(randomBytes(MIN_SALT_BYTES)),
  };
  validateKdfParams(params);
  return params;
}

/**
 * Rejects attacker-controlled or corrupted KDF parameters before they can be
 * used to exhaust memory or CPU.
 */
export function validateKdfParams(params: KdfParams): void {
  if (params.algo !== "argon2id") {
    throw new CryptoError("INVALID_PARAMS", "Unsupported KDF algorithm");
  }
  if (params.version !== KDF_VERSION) {
    throw new CryptoError("INVALID_PARAMS", "Unsupported KDF version");
  }
  if (
    params.memoryKiB < LIMITS.memoryKiB.min ||
    params.memoryKiB > LIMITS.memoryKiB.max
  ) {
    throw new CryptoError("INVALID_PARAMS", "KDF memory cost out of range");
  }
  if (
    params.iterations < LIMITS.iterations.min ||
    params.iterations > LIMITS.iterations.max
  ) {
    throw new CryptoError("INVALID_PARAMS", "KDF iteration count out of range");
  }
  if (
    params.parallelism < LIMITS.parallelism.min ||
    params.parallelism > LIMITS.parallelism.max
  ) {
    throw new CryptoError("INVALID_PARAMS", "KDF parallelism out of range");
  }
  if (params.memoryKiB < 8 * params.parallelism) {
    throw new CryptoError("INVALID_PARAMS", "KDF memory too small for parallelism");
  }

  let salt: Uint8Array;
  try {
    salt = base64ToBytes(params.salt);
  } catch {
    throw new CryptoError("INVALID_PARAMS", "KDF salt is not valid base64");
  }
  if (salt.length < MIN_SALT_BYTES) {
    throw new CryptoError("INVALID_PARAMS", "KDF salt is too short");
  }
}

/**
 * Derives the master key from the master password. This runs on the client;
 * the raw master key and everything derived from it (except the auth hash)
 * never leaves the device.
 */
export async function deriveMasterKey(
  password: string,
  params: KdfParams,
): Promise<Uint8Array> {
  validateKdfParams(params);
  if (password.length === 0) {
    throw new CryptoError("WEAK_PASSWORD", "Master password is required");
  }

  return argon2idAsync(utf8ToBytes(password), base64ToBytes(params.salt), {
    t: params.iterations,
    m: params.memoryKiB,
    p: params.parallelism,
    dkLen: MASTER_KEY_BYTES,
  });
}
