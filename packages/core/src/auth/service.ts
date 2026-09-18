import { eq } from "drizzle-orm";
import { bytesToHex, randomBytes } from "@ahaai/core/crypto/encoding";
import { isUniqueViolation } from "@ahaai/db/errors";
import type { KdfParams, User } from "@ahaai/db/schema";
import { userSettings, users } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";
import { recordSecurityEvent } from "./audit";
import { sessionTtlMs, type SessionTtlOptions } from "./cookies";
import {
  SERVER_AUTH_PARAMS,
  type PepperOptions,
  dummyVerify,
  generateAuthSalt,
  hashAuthHash,
  verifyAuthHash,
} from "./password";
import type { RequestContext } from "./request-context";
import { createSession, revokeAllSessions, revokeSession } from "./session";

/**
 * Security-relevant settings the API passes down from its validated config, so
 * the service layer does not re-read the environment. Every field is optional
 * and falls back to the environment for direct callers (tests, scripts).
 */
export type AuthServiceOptions = SessionTtlOptions & PepperOptions;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newSecurityStamp(): string {
  return bytesToHex(randomBytes(16));
}

/**
 * The one implementation of the "does this auth hash match the stored one"
 * comparison. Every re-authentication path calls this rather than repeating the
 * Argon2id verify, so a reprompt, a password change and an account deletion all
 * agree on what a matching master password means. Callers own the failure: a
 * reprompt must fail generically, while a password change can name the problem.
 */
export async function checkAuthHash(
  user: Pick<User, "authSalt" | "authHash" | "authParams">,
  authHash: string,
  options: PepperOptions = {},
): Promise<boolean> {
  return verifyAuthHash(
    authHash,
    user.authSalt,
    user.authHash,
    user.authParams,
    options,
  );
}

export interface RegisterInput {
  email: string;
  authHash: string;
  kdfParams: KdfParams;
  protectedVaultKey: string;
}

export interface AuthSuccess {
  user: User;
  token: string;
  expiresAt: Date;
  ttlMs: number;
}

export async function registerUser(
  db: Database,
  input: RegisterInput,
  ctx: Partial<RequestContext> = {},
  options: AuthServiceOptions = {},
): Promise<AuthSuccess> {
  const emailNormalized = normalizeEmail(input.email);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailNormalized, emailNormalized))
    .limit(1);

  if (existing.length > 0) {
    throw AppError.conflict("An account with this email already exists");
  }

  const authSalt = generateAuthSalt();
  const storedHash = await hashAuthHash(input.authHash, authSalt, SERVER_AUTH_PARAMS, options);

  let user: User;
  try {
    // User and settings land together: a half-created account would otherwise
    // be left without settings when a write fails midway.
    user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email: input.email,
          emailNormalized,
          authHash: storedHash,
          authSalt,
          authParams: SERVER_AUTH_PARAMS,
          kdfParams: input.kdfParams,
          kdfVersion: input.kdfParams.version,
          protectedVaultKey: input.protectedVaultKey,
          securityStamp: newSecurityStamp(),
        })
        .returning();

      await tx.insert(userSettings).values({ userId: created.id });
      return created;
    });
  } catch (error) {
    // The pre-check above races with concurrent sign ups; the unique index is
    // the real guard, so map its violation to the same conflict.
    if (isUniqueViolation(error)) {
      throw AppError.conflict("An account with this email already exists");
    }
    throw error;
  }

  const { token, session } = await createSession(db, user.id, ctx, options);
  await recordSecurityEvent(db, {
    userId: user.id,
    type: "auth.register",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return {
    user,
    token,
    expiresAt: session.expiresAt,
    ttlMs: sessionTtlMs(options),
  };
}

export interface LoginInput {
  email: string;
  authHash: string;
}

export type LoginResult =
  | ({ status: "ok" } & AuthSuccess)
  | { status: "invalid" };

export async function loginUser(
  db: Database,
  input: LoginInput,
  ctx: Partial<RequestContext> = {},
  options: AuthServiceOptions = {},
): Promise<LoginResult> {
  const emailNormalized = normalizeEmail(input.email);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.emailNormalized, emailNormalized))
    .limit(1);

  if (!user) {
    await dummyVerify(input.authHash, options);
    await recordSecurityEvent(db, {
      type: "auth.login.failed",
      severity: "warning",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: "unknown_account" },
    });
    return { status: "invalid" };
  }

  if (user.disabledAt !== null) {
    await recordSecurityEvent(db, {
      userId: user.id,
      type: "auth.login.failed",
      severity: "warning",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: "disabled_account" },
    });
    return { status: "invalid" };
  }

  const valid = await verifyAuthHash(
    input.authHash,
    user.authSalt,
    user.authHash,
    user.authParams,
    options,
  );

  if (!valid) {
    await recordSecurityEvent(db, {
      userId: user.id,
      type: "auth.login.failed",
      severity: "warning",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: "bad_credentials" },
    });
    return { status: "invalid" };
  }

  const { token, session } = await createSession(db, user.id, ctx, options);

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await recordSecurityEvent(db, {
    userId: user.id,
    type: "auth.login.success",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return {
    status: "ok",
    user,
    token,
    expiresAt: session.expiresAt,
    ttlMs: sessionTtlMs(options),
  };
}

export async function logoutUser(
  db: Database,
  sessionId: string,
  userId: string,
  ctx: Partial<RequestContext> = {},
): Promise<void> {
  await revokeSession(db, sessionId);
  await recordSecurityEvent(db, {
    userId,
    type: "auth.logout",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export interface ChangePasswordInput {
  userId: string;
  sessionId: string;
  currentAuthHash: string;
  authHash: string;
  kdfParams: KdfParams;
  protectedVaultKey: string;
}

export interface ChangePasswordResult {
  securityStamp: string;
  revokedSessions: number;
}

export async function changeMasterPassword(
  db: Database,
  input: ChangePasswordInput,
  ctx: Partial<RequestContext> = {},
  options: AuthServiceOptions = {},
): Promise<ChangePasswordResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) throw AppError.unauthorized();

  const valid = await checkAuthHash(user, input.currentAuthHash, options);

  if (!valid) {
    await recordSecurityEvent(db, {
      userId: user.id,
      type: "auth.login.failed",
      severity: "warning",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: "password_change_reauth_failed" },
    });
    throw AppError.forbidden("Current master password is incorrect");
  }

  const authSalt = generateAuthSalt();
  const storedHash = await hashAuthHash(input.authHash, authSalt, SERVER_AUTH_PARAMS, options);
  const securityStamp = newSecurityStamp();

  // The re-sealed key and the sign out of every other session have to land
  // together: rotating the key while old sessions survive would leave sessions
  // that can no longer open the vault.
  const revokedSessions = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        authHash: storedHash,
        authSalt,
        authParams: SERVER_AUTH_PARAMS,
        kdfParams: input.kdfParams,
        kdfVersion: input.kdfParams.version,
        protectedVaultKey: input.protectedVaultKey,
        securityStamp,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return revokeAllSessions(tx as unknown as Database, user.id, input.sessionId);
  });

  await recordSecurityEvent(db, {
    userId: user.id,
    type: "auth.password.changed",
    severity: "warning",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { revokedSessions },
  });

  return { securityStamp, revokedSessions };
}

export interface ChangeEmailInput {
  userId: string;
  sessionId: string;
  email: string;
  protectedVaultKey: string;
}

export interface ChangeEmailResult {
  user: User;
  revokedSessions: number;
}

/**
 * Changes the account email. The wrapped vault key is AAD-bound to the
 * normalized address, so the caller must already have re-wrapped it for the new
 * address: storing an envelope sealed for the old binding would break unlock
 * with a GCM tag error, silently and only at unlock time. The new address and
 * the new envelope land together, and every other session is signed out.
 */
export async function changeEmail(
  db: Database,
  input: ChangeEmailInput,
  ctx: Partial<RequestContext> = {},
): Promise<ChangeEmailResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) throw AppError.unauthorized();

  const emailNormalized = normalizeEmail(input.email);

  // The caller's own row is allowed through: re-wrapping under the same address
  // is harmless. Anyone else holding the normalized address is a conflict, the
  // same answer registration gives.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailNormalized, emailNormalized))
    .limit(1);

  if (existing.length > 0 && existing[0].id !== user.id) {
    throw AppError.conflict("An account with this email already exists");
  }

  const securityStamp = newSecurityStamp();

  let result: ChangeEmailResult;
  try {
    // The address change, the re-sealed key and the sign out of other sessions
    // must land together: an address bound to the wrong envelope would leave the
    // vault unopenable on the next unlock.
    result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({
          email: input.email,
          emailNormalized,
          protectedVaultKey: input.protectedVaultKey,
          securityStamp,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      const revokedSessions = await revokeAllSessions(
        tx as unknown as Database,
        user.id,
        input.sessionId,
      );

      return { user: updated, revokedSessions };
    });
  } catch (error) {
    // The pre-check races with a concurrent sign up; the unique index is the
    // real guard, so map its violation to the same conflict.
    if (isUniqueViolation(error)) {
      throw AppError.conflict("An account with this email already exists");
    }
    throw error;
  }

  await recordSecurityEvent(db, {
    userId: user.id,
    type: "auth.email.changed",
    severity: "warning",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { revokedSessions: result.revokedSessions },
  });

  return result;
}

export interface DeleteAccountInput {
  userId: string;
  authHash: string;
}

export interface DeleteAccountResult {
  deleted: true;
}

/**
 * Deletes the account after re-checking the master password. The audit row is
 * written inside the same transaction and before the delete, so the trail
 * survives: `security_events.user_id` is ON DELETE SET NULL, which anonymises
 * the record instead of the cascade erasing it.
 */
export async function deleteAccount(
  db: Database,
  input: DeleteAccountInput,
  ctx: Partial<RequestContext> = {},
  options: AuthServiceOptions = {},
): Promise<DeleteAccountResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) throw AppError.unauthorized();

  const valid = await checkAuthHash(user, input.authHash, options);
  if (!valid) {
    await recordSecurityEvent(db, {
      userId: user.id,
      type: "auth.verify.failed",
      severity: "warning",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { reason: "account_delete_reauth_failed" },
    });
    throw AppError.unauthorized("Master password is incorrect");
  }

  await db.transaction(async (tx) => {
    await recordSecurityEvent(tx as unknown as Database, {
      userId: user.id,
      type: "auth.account.deleted",
      severity: "critical",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await tx.delete(users).where(eq(users.id, user.id));
  });

  return { deleted: true };
}
