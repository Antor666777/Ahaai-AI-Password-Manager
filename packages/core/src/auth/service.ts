import { eq } from "drizzle-orm";
import { bytesToHex, randomBytes } from "@ahaai/core/crypto/encoding";
import { isUniqueViolation } from "@ahaai/db/errors";
import type { KdfParams, User } from "@ahaai/db/schema";
import { userSettings, users } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";
import { recordSecurityEvent } from "./audit";
import { sessionTtlMs } from "./cookies";
import {
  SERVER_AUTH_PARAMS,
  dummyVerify,
  generateAuthSalt,
  hashAuthHash,
  verifyAuthHash,
} from "./password";
import type { RequestContext } from "./request-context";
import { createSession, revokeAllSessions, revokeSession } from "./session";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newSecurityStamp(): string {
  return bytesToHex(randomBytes(16));
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
  const storedHash = await hashAuthHash(input.authHash, authSalt);

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

  const { token, session } = await createSession(db, user.id, ctx);
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
    ttlMs: sessionTtlMs(),
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
): Promise<LoginResult> {
  const emailNormalized = normalizeEmail(input.email);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.emailNormalized, emailNormalized))
    .limit(1);

  if (!user) {
    await dummyVerify(input.authHash);
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

  const { token, session } = await createSession(db, user.id, ctx);

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
    ttlMs: sessionTtlMs(),
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
): Promise<ChangePasswordResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) throw AppError.unauthorized();

  const valid = await verifyAuthHash(
    input.currentAuthHash,
    user.authSalt,
    user.authHash,
    user.authParams,
  );

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
  const storedHash = await hashAuthHash(input.authHash, authSalt);
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
