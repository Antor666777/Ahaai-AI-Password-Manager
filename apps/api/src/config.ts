import { z } from "zod";
import { base64ToBytes } from "@ahaai/core/crypto/encoding";

const MASTER_KEY_BYTES = 32;
const MIN_PEPPER_CHARS = 16;
const GENERATE_SECRET_HINT =
  "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface Config {
  isProduction: boolean;
  port: number;
  authPepper: string;
  encryptionMasterKey: string;
  databaseUrl: string | undefined;
  allowEmbeddedDb: boolean;
  sessionTtlDays: number;
  cookieSecure: boolean | undefined;
  trustProxy: boolean;
  corsAllowedOrigins: string[];
  hibpUserAgent: string;
  serveStatic: boolean;
  staticRoot: string | undefined;
}

function isMasterKey(value: string): boolean {
  try {
    return base64ToBytes(value).length === MASTER_KEY_BYTES;
  } catch {
    return false;
  }
}

const schema = z.object({
  NODE_ENV: z.string().optional(),
  AUTH_PEPPER: z
    .string({ error: `AUTH_PEPPER is required. ${GENERATE_SECRET_HINT}` })
    .min(
      MIN_PEPPER_CHARS,
      `AUTH_PEPPER must be at least ${MIN_PEPPER_CHARS} characters. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    ),
  ENCRYPTION_MASTER_KEY: z
    .string({ error: `ENCRYPTION_MASTER_KEY is required. ${GENERATE_SECRET_HINT}` })
    .refine(
      isMasterKey,
      "ENCRYPTION_MASTER_KEY must be exactly 32 bytes, base64 encoded. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    ),
  DATABASE_URL: z.string().optional(),
  AHAALI_ALLOW_EMBEDDED_DB: z.enum(["0", "1"]).optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(30),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  TRUST_PROXY: z.enum(["0", "1"]).default("1"),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  HIBP_USER_AGENT: z.string().default("Ahaai-Password-Manager"),
  SERVE_STATIC: z.enum(["0", "1"]).default("0"),
  STATIC_ROOT: z.string().optional(),
});

export function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Validates the environment once, at boot, so a misconfigured deployment fails
 * immediately with a message naming the variable instead of throwing on the
 * first login attempt.
 */
export function loadConfig(
  env: Record<string, string | undefined>,
): Config {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(
      `Invalid environment configuration:\n${details}\n\nSee .env.example for the full list of variables.`,
    );
  }

  const value = parsed.data;

  return {
    isProduction: value.NODE_ENV === "production",
    port: value.PORT,
    authPepper: value.AUTH_PEPPER,
    encryptionMasterKey: value.ENCRYPTION_MASTER_KEY,
    databaseUrl: value.DATABASE_URL,
    allowEmbeddedDb: value.AHAALI_ALLOW_EMBEDDED_DB === "1",
    sessionTtlDays: value.SESSION_TTL_DAYS,
    cookieSecure:
      value.COOKIE_SECURE === undefined ? undefined : value.COOKIE_SECURE === "true",
    trustProxy: value.TRUST_PROXY !== "0",
    corsAllowedOrigins: parseOrigins(value.CORS_ALLOWED_ORIGINS),
    hibpUserAgent: value.HIBP_USER_AGENT,
    serveStatic: value.SERVE_STATIC === "1",
    staticRoot: value.STATIC_ROOT,
  };
}
