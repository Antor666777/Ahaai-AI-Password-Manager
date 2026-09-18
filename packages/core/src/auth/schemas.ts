import { z } from "zod";
import { AUTH_HASH_RE } from "@ahaai/core/crypto/split";
import { envelopeSchema } from "@ahaai/core/http/schemas";

export { envelopeSchema };

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email("Enter a valid email address");

export const authHashSchema = z
  .string()
  .regex(AUTH_HASH_RE, "Auth hash must be 64 lowercase hex characters");

export const kdfParamsSchema = z.object({
  algo: z.literal("argon2id"),
  version: z.literal(1),
  memoryKiB: z.number().int().min(8192).max(262144),
  iterations: z.number().int().min(1).max(10),
  parallelism: z.number().int().min(1).max(8),
  salt: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Salt must be base64"),
});

export const registerSchema = z.object({
  email: emailSchema,
  authHash: authHashSchema,
  kdfParams: kdfParamsSchema,
  protectedVaultKey: envelopeSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  authHash: authHashSchema,
});

export const changePasswordSchema = z.object({
  currentAuthHash: authHashSchema,
  authHash: authHashSchema,
  kdfParams: kdfParamsSchema,
  protectedVaultKey: envelopeSchema,
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Body for revoking every session. `includeCurrent` defaults to false so the
 * browser keeps its own session; API and extension clients opt in to end it too.
 */
export const revokeAllSessionsSchema = z.object({
  includeCurrent: z.boolean().optional().default(false),
});

/** Re-checking the master password before a reprompt reveals a secret. */
export const verifyMasterPasswordSchema = z.object({
  authHash: authHashSchema,
});

export const changeEmailSchema = z.object({
  email: emailSchema,
  protectedVaultKey: envelopeSchema,
});

export const deleteAccountSchema = z.object({
  authHash: authHashSchema,
});
