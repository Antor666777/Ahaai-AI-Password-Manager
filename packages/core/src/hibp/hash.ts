import { sha1 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Password hashing for the breach check. It lives in core rather than the web
 * app so the digest is computed once, tested against known vectors, and shared
 * by any client that checks a password. Neither helper sends anything.
 */

/**
 * Upper-case hex SHA-1. The Pwned Passwords k-anonymity API is keyed on the
 * first five characters of this digest, which is all a caller may transmit.
 */
export function sha1HexUpper(input: string): string {
  return bytesToHex(sha1(utf8ToBytes(input))).toUpperCase();
}

/** Hex SHA-256, for comparisons that must never leave the device. */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}
