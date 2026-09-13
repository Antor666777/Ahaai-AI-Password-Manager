import { z } from "zod";

/**
 * A versioned AES-256-GCM envelope produced by `lib/crypto/aead`.
 * `v1.<base64 nonce>.<base64 ciphertext+tag>`
 */
export const envelopeSchema = z
  .string()
  .min(16)
  .max(65536)
  .regex(
    /^v1\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}$/,
    "Invalid encrypted envelope",
  );

export const uuidSchema = z.string().uuid();

export const booleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const isoDateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");
