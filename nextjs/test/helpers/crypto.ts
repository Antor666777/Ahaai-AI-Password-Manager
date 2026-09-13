import { bytesToBase64, randomBytes } from "@/lib/crypto/encoding";
import type { KdfParams } from "@/lib/db/schema";

/**
 * Fast-but-valid Argon2id parameters for tests. They satisfy the production
 * bounds (>= 8 MiB memory) while keeping derivations quick.
 */
export function cheapKdfParams(
  overrides: Partial<KdfParams> = {},
): KdfParams {
  return {
    algo: "argon2id",
    version: 1,
    memoryKiB: 8192,
    iterations: 1,
    parallelism: 1,
    salt: bytesToBase64(randomBytes(16)),
    ...overrides,
  };
}
