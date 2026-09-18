import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { recordSecurityEvent } from "@ahaai/core/auth/audit";
import {
  buildClearSessionCookie,
  buildSessionCookie,
} from "@ahaai/core/auth/cookies";
import { requireAuth } from "@ahaai/core/auth/guard";
import { getClientIp, getRequestContext } from "@ahaai/core/auth/request-context";
import {
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  revokeAllSessionsSchema,
  verifyMasterPasswordSchema,
} from "@ahaai/core/auth/schemas";
import {
  toPublicSession,
  toPublicUser,
  toSettingsView,
} from "@ahaai/core/auth/serializers";
import {
  changeEmail,
  changeMasterPassword,
  checkAuthHash,
  deleteAccount,
  loginUser,
  logoutUser,
  normalizeEmail,
  registerUser,
} from "@ahaai/core/auth/service";
import {
  listSessions,
  revokeAllSessions,
  revokeSession,
} from "@ahaai/core/auth/session";
import { bytesToBase64, utf8ToBytes } from "@ahaai/core/crypto/encoding";
import { DEFAULT_KDF_PARAMS, KDF_VERSION } from "@ahaai/core/crypto/kdf";
import { AppError } from "@ahaai/core/http/errors";
import { jsonCreated, jsonOk } from "@ahaai/core/http/responses";
import { parseIdParam, parseJson, parseQuery } from "@ahaai/core/http/validate";
import { enforceRateLimit } from "@ahaai/core/rate-limit";
import { getSettings } from "@ahaai/core/settings";
import { securityEvents, sessions, users } from "@ahaai/db/schema";
import type { AppEnv } from "../types";

const preloginQuerySchema = z.object({
  email: z.string().trim().min(3).max(254),
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
    .optional(),
});

/**
 * Deterministic decoy so prelogin answers unknown emails indistinguishably
 * from known ones, closing the account-enumeration channel.
 */
function decoySalt(email: string, pepper: string): string {
  const digest = hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(`prelogin:${email}`));
  return bytesToBase64(digest.slice(0, 16));
}

export function registerAuthRoutes(app: Hono<AppEnv>): void {
  app.post("/auth/register", async (c) => {
    const { db, config } = c.get("deps");
    const context = getRequestContext(c.req.raw, {
      trustProxy: config.trustProxy,
    });
    const ip = context.ip ?? "unknown";
    await enforceRateLimit("register", `ip:${ip}`);

    const body = await parseJson(c.req.raw, registerSchema);
    const result = await registerUser(db, body, context, {
      pepper: config.authPepper,
      sessionTtlDays: config.sessionTtlDays,
    });

    return jsonCreated(
      {
        user: toPublicUser(result.user),
        vault: {
          protectedVaultKey: result.user.protectedVaultKey,
          kdfParams: result.user.kdfParams,
        },
        expiresAt: result.expiresAt.toISOString(),
      },
      {
        headers: {
          "set-cookie": buildSessionCookie(result.token, result.ttlMs, {
            cookieSecure: config.cookieSecure ?? config.isProduction,
          }),
        },
      },
    );
  });

  app.post("/auth/login", async (c) => {
    const { db, config } = c.get("deps");
    const context = getRequestContext(c.req.raw, {
      trustProxy: config.trustProxy,
    });
    const ip = context.ip ?? "unknown";
    await enforceRateLimit("login", `ip:${ip}`);

    const body = await parseJson(c.req.raw, loginSchema);
    await enforceRateLimit("loginPerEmail", `email:${normalizeEmail(body.email)}`);

    const result = await loginUser(db, body, context, {
      pepper: config.authPepper,
      sessionTtlDays: config.sessionTtlDays,
    });

    if (result.status !== "ok") {
      throw AppError.unauthorized("Invalid email or master password");
    }

    return jsonOk(
      {
        user: toPublicUser(result.user),
        vault: {
          protectedVaultKey: result.user.protectedVaultKey,
          kdfParams: result.user.kdfParams,
        },
        expiresAt: result.expiresAt.toISOString(),
      },
      {
        headers: {
          "set-cookie": buildSessionCookie(result.token, result.ttlMs, {
            cookieSecure: config.cookieSecure ?? config.isProduction,
          }),
        },
      },
    );
  });

  app.post("/auth/token", async (c) => {
    const { db, config } = c.get("deps");
    const context = getRequestContext(c.req.raw, {
      trustProxy: config.trustProxy,
    });
    const ip = context.ip ?? "unknown";
    await enforceRateLimit("login", `ip:${ip}`);

    const body = await parseJson(c.req.raw, loginSchema);
    await enforceRateLimit("loginPerEmail", `email:${normalizeEmail(body.email)}`);

    const result = await loginUser(db, body, context, {
      pepper: config.authPepper,
      sessionTtlDays: config.sessionTtlDays,
    });

    if (result.status !== "ok") {
      throw AppError.unauthorized("Invalid email or master password");
    }

    return jsonOk(
      {
        token: result.token,
        tokenType: "Bearer",
        expiresAt: result.expiresAt.toISOString(),
        user: toPublicUser(result.user),
        vault: {
          protectedVaultKey: result.user.protectedVaultKey,
          kdfParams: result.user.kdfParams,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  });

  app.post("/auth/logout", async (c) => {
    const { db, config } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);

    await logoutUser(
      db,
      session.id,
      user.id,
      getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
    );

    return jsonOk(
      { ok: true },
      {
        headers: {
          "set-cookie": buildClearSessionCookie({
            cookieSecure: config.cookieSecure ?? config.isProduction,
          }),
        },
      },
    );
  });

  app.get("/auth/prelogin", async (c) => {
    const { db, config } = c.get("deps");
    const ip = getClientIp(c.req.raw, { trustProxy: config.trustProxy }) ?? "unknown";
    await enforceRateLimit("login", `ip:${ip}`);

    const { email } = parseQuery(c.req.raw, preloginQuerySchema);
    const emailNormalized = normalizeEmail(email);

    const [user] = await db
      .select({ kdfParams: users.kdfParams })
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);

    const kdfParams = user?.kdfParams ?? {
      ...DEFAULT_KDF_PARAMS,
      version: KDF_VERSION,
      salt: decoySalt(emailNormalized, config.authPepper),
    };

    return jsonOk({ kdfParams });
  });

  app.get("/auth/session", async (c) => {
    const { db } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);
    const settings = await getSettings(db, user.id);

    return jsonOk({
      user: toPublicUser(user),
      session: toPublicSession(session, session.id),
      settings: toSettingsView(settings),
      vault: {
        protectedVaultKey: user.protectedVaultKey,
        kdfParams: user.kdfParams,
      },
    });
  });

  app.post("/auth/password", async (c) => {
    const { db, config } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("passwordChange", `user:${user.id}`);
    const body = await parseJson(c.req.raw, changePasswordSchema);

    const result = await changeMasterPassword(
      db,
      {
        userId: user.id,
        sessionId: session.id,
        currentAuthHash: body.currentAuthHash,
        authHash: body.authHash,
        kdfParams: body.kdfParams,
        protectedVaultKey: body.protectedVaultKey,
      },
      getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
      { pepper: config.authPepper },
    );

    return jsonOk({
      securityStamp: result.securityStamp,
      revokedSessions: result.revokedSessions,
    });
  });

  app.post("/auth/verify", async (c) => {
    const { db, config } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    // Same policy as the login per-email rule: this is password guessing.
    await enforceRateLimit("verify", `user:${user.id}`);
    const { authHash } = await parseJson(c.req.raw, verifyMasterPasswordSchema);

    // Unlike prelogin, the account is already known here, so no decoy is needed
    // to keep timing uniform: one Argon2 verify runs whether or not it matches.
    const valid = await checkAuthHash(user, authHash, {
      pepper: config.authPepper,
    });

    if (!valid) {
      await recordSecurityEvent(db, {
        userId: user.id,
        type: "auth.verify.failed",
        severity: "warning",
        ...getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
      });
      // Never say more than "no": a caller learns nothing about the account.
      throw AppError.unauthorized();
    }

    // Successes are not recorded, so the activity timeline stays readable.
    return jsonOk({ ok: true });
  });

  app.post("/auth/email", async (c) => {
    const { db, config } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("accountChange", `user:${user.id}`);
    const body = await parseJson(c.req.raw, changeEmailSchema);

    const result = await changeEmail(
      db,
      {
        userId: user.id,
        sessionId: session.id,
        email: body.email,
        protectedVaultKey: body.protectedVaultKey,
      },
      getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
    );

    // Frozen contract: the client reads exactly these two fields.
    return jsonOk({
      user: toPublicUser(result.user),
      revokedSessions: result.revokedSessions,
    });
  });

  app.delete("/auth/account", async (c) => {
    const { db, config } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("accountChange", `user:${user.id}`);
    const { authHash } = await parseJson(c.req.raw, deleteAccountSchema);

    await deleteAccount(
      db,
      { userId: user.id, authHash },
      getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
      { pepper: config.authPepper },
    );

    return jsonOk(
      { deleted: true },
      {
        headers: {
          "set-cookie": buildClearSessionCookie({
            cookieSecure: config.cookieSecure ?? config.isProduction,
          }),
        },
      },
    );
  });

  app.post("/auth/sessions/revoke-all", async (c) => {
    const { db, config } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("sessionAdmin", `user:${user.id}`);
    const { includeCurrent } = await parseJson(c.req.raw, revokeAllSessionsSchema);

    // The browser keeps this device signed in by default; only extension and API
    // clients pass includeCurrent, which ends the caller's own session too.
    const revoked = await revokeAllSessions(
      db,
      user.id,
      includeCurrent ? undefined : session.id,
    );

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "session.revoked_all",
      severity: "warning",
      ...getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
      metadata: { count: revoked, includeCurrent },
    });

    // Ending the caller's session has to clear its cookie, the same way logout
    // does, or the browser would keep presenting a dead token.
    return jsonOk(
      { revoked },
      includeCurrent
        ? {
            headers: {
              "set-cookie": buildClearSessionCookie({
                cookieSecure: config.cookieSecure ?? config.isProduction,
              }),
            },
          }
        : undefined,
    );
  });

  app.get("/auth/sessions", async (c) => {
    const { db } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);

    const rows = await listSessions(db, user.id);

    return jsonOk({
      sessions: rows.map((entry) => toPublicSession(entry, session.id)),
    });
  });

  app.delete("/auth/sessions/:id", async (c) => {
    const { db, config } = c.get("deps");
    const { user, session } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    if (id === session.id) {
      throw AppError.badRequest("Use logout to end the current session");
    }

    const [target] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .limit(1);

    if (!target) throw AppError.notFound("Session not found");

    await revokeSession(db, target.id);
    await recordSecurityEvent(db, {
      userId: user.id,
      type: "session.revoked",
      severity: "warning",
      ...getRequestContext(c.req.raw, { trustProxy: config.trustProxy }),
      metadata: { sessionId: target.id },
    });

    return jsonOk({ ok: true });
  });

  app.get("/auth/events", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const { limit, before } = parseQuery(c.req.raw, eventsQuerySchema);

    const conditions: SQL[] = [eq(securityEvents.userId, user.id)];
    if (before) {
      conditions.push(lt(securityEvents.createdAt, new Date(before)));
    }

    const events = await db
      .select()
      .from(securityEvents)
      .where(and(...conditions))
      .orderBy(desc(securityEvents.createdAt))
      .limit(limit);

    const last = events.at(-1);

    return jsonOk({
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor:
        events.length === limit && last ? last.createdAt.toISOString() : null,
    });
  });
}
