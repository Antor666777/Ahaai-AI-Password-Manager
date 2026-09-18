import { z } from "zod";
import { MAX_PWNED_BATCH } from "./client";

/** One k-anonymity prefix: exactly five hex characters. */
export const pwnedPrefixSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{5}$/, "Each prefix must be 5 hex characters")
  .transform((value) => value.toUpperCase());

/**
 * Body of the batch range endpoint. The client sends the 5-character SHA-1
 * prefixes only; the rest of each hash never leaves the browser. Prefixes are
 * normalized to upper case here so downstream fan-out and cache keys agree.
 */
export const pwnedRangesSchema = z.object({
  prefixes: z.array(pwnedPrefixSchema).min(1).max(MAX_PWNED_BATCH),
});

export type PwnedRangesInput = z.infer<typeof pwnedRangesSchema>;
