import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

/**
 * RFC 6238 time-based one-time passwords. The shared secret is the only thing
 * stored; the live code is derived locally so nothing rotating ever leaks.
 */

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type TotpErrorCode = "INVALID_BASE32" | "INVALID_URI" | "INVALID_PARAMS";

/** Mirrors CryptoError so callers can branch on a code without parsing text. */
export class TotpError extends Error {
  readonly code: TotpErrorCode;

  constructor(code: TotpErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "TotpError";
    this.code = code;
  }
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const MIN_DIGITS = 6;
const MAX_DIGITS = 8;

/** The hash functions @noble/hashes exposes for each TOTP algorithm. */
const HASHES = { SHA1: sha1, SHA256: sha256, SHA512: sha512 } as const;

/**
 * RFC 4648 base32 lets an authenticator secret be written with spaces, lower
 * case and optional trailing padding. This strips those and upper-cases, then
 * rejects anything that is not in the A-Z2-7 alphabet.
 */
export function normalizeBase32(input: string): string {
  if (typeof input !== "string") {
    throw new TotpError("INVALID_BASE32", "Base32 secret must be a string");
  }

  const stripped = input.replace(/\s+/g, "").toUpperCase();
  const unpadded = stripped.replace(/=+$/, "");
  if (unpadded.length === 0) {
    throw new TotpError("INVALID_BASE32", "Base32 secret is empty");
  }
  if (unpadded.includes("=")) {
    throw new TotpError("INVALID_BASE32", "Base32 padding is only allowed at the end");
  }
  for (const char of unpadded) {
    if (!BASE32_ALPHABET.includes(char)) {
      throw new TotpError("INVALID_BASE32", `"${char}" is not a base32 character`);
    }
  }
  return unpadded;
}

/** Decodes an RFC 4648 base32 secret to the raw shared key bytes. */
export function decodeBase32(input: string): Uint8Array {
  const normalized = normalizeBase32(input);
  const output = new Uint8Array(Math.floor((normalized.length * 5) / 8));

  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output[index] = (value >> bits) & 0xff;
      index += 1;
      // Keep only the bits that are still pending so the window never overflows.
      value &= (1 << bits) - 1;
    }
  }
  return output;
}

export interface TotpParams {
  /** Normalized base32 secret (upper-case, no spaces or padding). */
  secret: string;
  issuer?: string;
  account?: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
}

export interface TotpOptions {
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
  /** Unix seconds, or a Date. Defaults to the current time. */
  at?: number | Date;
}

function secondsFrom(at?: number | Date): number {
  if (at === undefined) return Date.now() / 1000;
  if (at instanceof Date) return at.getTime() / 1000;
  return at;
}

/** The HOTP counter is an 8-byte big-endian integer. */
function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return bytes;
}

/**
 * Generates an RFC 6238 code for the counter covering `at`. The secret may be a
 * base32 string (as stored in a vault item) or the already-decoded key bytes.
 */
export function generateTotp(
  secret: Uint8Array | string,
  options: TotpOptions = {},
): string {
  const digits = options.digits ?? DEFAULT_DIGITS;
  const period = options.period ?? DEFAULT_PERIOD;
  const algorithm = options.algorithm ?? "SHA1";

  if (!Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new TotpError(
      "INVALID_PARAMS",
      `digits must be an integer between ${MIN_DIGITS} and ${MAX_DIGITS}`,
    );
  }
  if (!Number.isInteger(period) || period <= 0) {
    throw new TotpError("INVALID_PARAMS", "period must be a positive integer of seconds");
  }
  if (!(algorithm in HASHES)) {
    throw new TotpError("INVALID_PARAMS", `Unsupported algorithm: ${algorithm}`);
  }

  const key = typeof secret === "string" ? decodeBase32(secret) : secret;
  if (key.length === 0) {
    throw new TotpError("INVALID_PARAMS", "The TOTP secret is empty");
  }

  const counter = Math.floor(secondsFrom(options.at) / period);
  const digest = hmac(HASHES[algorithm], key, counterBytes(counter));

  // Dynamic truncation: the low nibble of the last byte picks the 4-byte slice.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const code = binary % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

/** Whole seconds left in the current step, from `period` down to 1. */
export function totpSecondsRemaining(period: number, at?: number | Date): number {
  if (!Number.isInteger(period) || period <= 0) {
    throw new TotpError("INVALID_PARAMS", "period must be a positive integer of seconds");
  }
  const seconds = Math.floor(secondsFrom(at));
  const used = ((seconds % period) + period) % period;
  return used === 0 ? period : period - used;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitLabel(label: string): [string | undefined, string | undefined] {
  const index = label.indexOf(":");
  if (index === -1) return [undefined, label.trim() || undefined];
  const issuer = label.slice(0, index).trim();
  const account = label.slice(index + 1).trim();
  return [issuer || undefined, account || undefined];
}

function parseAlgorithm(value: string | null): TotpAlgorithm {
  const key = (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return key === "SHA256" || key === "SHA512" ? key : "SHA1";
}

function parseDigits(value: string | null): number {
  const digits = Number.parseInt(value ?? "", 10);
  if (Number.isInteger(digits) && digits >= MIN_DIGITS && digits <= MAX_DIGITS) {
    return digits;
  }
  return DEFAULT_DIGITS;
}

function parsePeriod(value: string | null): number {
  const period = Number.parseInt(value ?? "", 10);
  if (Number.isInteger(period) && period > 0) return period;
  return DEFAULT_PERIOD;
}

/**
 * Parses an `otpauth://totp/...` URI. Missing or out-of-range parameters fall
 * back to the RFC defaults (6 digits, 30 second period, SHA1) and anything that
 * is not a usable TOTP descriptor returns null so callers can show one error.
 */
export function parseOtpauthUri(uri: string): TotpParams | null {
  if (typeof uri !== "string") return null;
  const trimmed = uri.trim();
  if (!/^otpauth:\/\//i.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "otpauth:" || url.host.toLowerCase() !== "totp") return null;

  const rawSecret = url.searchParams.get("secret");
  if (!rawSecret) return null;

  let secret: string;
  try {
    secret = normalizeBase32(rawSecret);
  } catch {
    return null;
  }

  const [labelIssuer, labelAccount] = splitLabel(safeDecode(url.pathname.replace(/^\/+/, "")));
  const issuerParam = url.searchParams.get("issuer")?.trim() || undefined;

  return {
    secret,
    issuer: issuerParam ?? labelIssuer,
    account: labelAccount,
    digits: parseDigits(url.searchParams.get("digits")),
    period: parsePeriod(url.searchParams.get("period")),
    algorithm: parseAlgorithm(url.searchParams.get("algorithm")),
  };
}

/**
 * Serializes a secret back to a canonical `otpauth://` URI so a stored item
 * keeps its custom parameters. Values that match the RFC defaults are omitted,
 * which keeps an ordinary account readable in the editor.
 */
export function buildOtpauthUri(params: {
  secret: string;
  issuer?: string;
  account?: string;
  digits?: number;
  period?: number;
  algorithm?: TotpAlgorithm;
}): string {
  const secret = normalizeBase32(params.secret);
  const digits = params.digits ?? DEFAULT_DIGITS;
  const period = params.period ?? DEFAULT_PERIOD;
  const algorithm = params.algorithm ?? "SHA1";

  if (!Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new TotpError(
      "INVALID_PARAMS",
      `digits must be an integer between ${MIN_DIGITS} and ${MAX_DIGITS}`,
    );
  }
  if (!Number.isInteger(period) || period <= 0) {
    throw new TotpError("INVALID_PARAMS", "period must be a positive integer of seconds");
  }
  if (!(algorithm in HASHES)) {
    throw new TotpError("INVALID_PARAMS", `Unsupported algorithm: ${algorithm}`);
  }

  const issuer = params.issuer?.trim();
  const account = params.account?.trim();
  const label = [issuer, account]
    .filter((part): part is string => Boolean(part))
    .map((part) => encodeURIComponent(part))
    .join(":");

  const query = new URLSearchParams({ secret });
  if (issuer) query.set("issuer", issuer);
  if (digits !== DEFAULT_DIGITS) query.set("digits", String(digits));
  if (period !== DEFAULT_PERIOD) query.set("period", String(period));
  if (algorithm !== "SHA1") query.set("algorithm", algorithm);

  return `otpauth://totp/${label}?${query.toString()}`;
}
