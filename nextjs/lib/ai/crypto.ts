import { openString, sealString } from "@/lib/crypto/aead";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { CryptoError } from "@/lib/crypto/errors";

const MASTER_KEY_BYTES = 32;
const PROVIDER_KEY_AAD = "ahaai:provider-key:v1";

function masterKey(): Uint8Array {
  const value = process.env.ENCRYPTION_MASTER_KEY;
  if (!value) {
    throw new CryptoError("INVALID_PARAMS", "ENCRYPTION_MASTER_KEY is not set");
  }
  const bytes = base64ToBytes(value);
  if (bytes.length !== MASTER_KEY_BYTES) {
    throw new CryptoError(
      "INVALID_PARAMS",
      "ENCRYPTION_MASTER_KEY must be 32 bytes of base64",
    );
  }
  return bytes;
}

/** Encrypts a BYOK provider API key for storage at rest. */
export function encryptApiKey(plaintext: string): string {
  return sealString(masterKey(), plaintext, PROVIDER_KEY_AAD);
}

export function decryptApiKey(envelope: string): string {
  return openString(masterKey(), envelope, PROVIDER_KEY_AAD);
}

/** Renders a key for display without revealing it. */
export function maskApiKey(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return tail.length === 4 ? `********${tail}` : "********";
}
