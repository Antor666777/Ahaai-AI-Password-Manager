export type CryptoErrorCode =
  | "INVALID_ENVELOPE"
  | "DECRYPT_FAILED"
  | "INVALID_KEY"
  | "INVALID_PARAMS"
  | "WEAK_PASSWORD";

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "CryptoError";
    this.code = code;
  }
}
