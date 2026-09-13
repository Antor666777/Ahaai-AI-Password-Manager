import { sha256 } from "@noble/hashes/sha2.js";
import { and, desc, eq, isNull, lt, ne } from "drizzle-orm";
import { bytesToBase64Url, bytesToHex, randomBytes, utf8ToBytes } from "@/lib/crypto/encoding";
import { sessions, users, type Session, type User } from "@/lib/db/schema";
import type { Database } from "@/lib/db/types";
import { sessionTtlMs } from "./cookies";
import type { RequestContext } from "./request-context";

export const SESSION_TOKEN_BYTES = 32;
const TOUCH_INTERVAL_MS = 60_000;

export function generateSessionToken(): string {
  return bytesToBase64Url(randomBytes(SESSION_TOKEN_BYTES));
}

/** Only the hash of a session token is ever stored. */
export function hashSessionToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

export interface CreatedSession {
  token: string;
  session: Session;
}

export async function createSession(
  db: Database,
  userId: string,
  ctx: Partial<RequestContext> = {},
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      deviceName: ctx.deviceName ?? null,
      deviceType: ctx.deviceType ?? null,
    })
    .returning();

  return { token, session };
}

export type SessionResolution =
  | { status: "active"; session: Session; user: User }
  | { status: "reuse"; sessionId: string }
  | { status: "none" };

/**
 * Resolves a session token. A token that matches a session's *previous* token
 * hash indicates token reuse (possible theft), so that session is revoked.
 */
export async function resolveSession(
  db: Database,
  token: string,
): Promise<SessionResolution> {
  const tokenHash = hashSessionToken(token);

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (row) {
    const invalid =
      row.session.revokedAt !== null ||
      row.session.expiresAt.getTime() <= Date.now() ||
      row.user.disabledAt !== null;
    if (invalid) return { status: "none" };
    return { status: "active", session: row.session, user: row.user };
  }

  const previous = await db
    .select()
    .from(sessions)
    .where(eq(sessions.previousTokenHash, tokenHash))
    .limit(1);

  const reused = previous[0];
  if (reused) {
    if (reused.revokedAt === null) {
      await revokeSession(db, reused.id);
    }
    return { status: "reuse", sessionId: reused.id };
  }

  return { status: "none" };
}

export async function touchSession(
  db: Database,
  session: Session,
): Promise<void> {
  if (Date.now() - session.lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, session.id));
}

/**
 * Issues a new token for an existing session and records the old token hash so
 * that presenting the old token later is detected as reuse.
 */
export async function rotateSession(
  db: Database,
  session: Session,
  ctx: Partial<RequestContext> = {},
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const [updated] = await db
    .update(sessions)
    .set({
      tokenHash: hashSessionToken(token),
      previousTokenHash: session.tokenHash,
      rotatedAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + sessionTtlMs()),
      ipAddress: ctx.ip ?? session.ipAddress,
      userAgent: ctx.userAgent ?? session.userAgent,
    })
    .where(eq(sessions.id, session.id))
    .returning();

  return { token, session: updated };
}

export async function revokeSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessions(
  db: Database,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const condition = exceptSessionId
    ? and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        ne(sessions.id, exceptSessionId),
      )
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(condition)
    .returning({ id: sessions.id });

  return revoked.length;
}

export async function listSessions(
  db: Database,
  userId: string,
): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastUsedAt));
}

export async function deleteExpiredSessions(
  db: Database,
  before: Date = new Date(),
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, before))
    .returning({ id: sessions.id });
  return deleted.length;
}
