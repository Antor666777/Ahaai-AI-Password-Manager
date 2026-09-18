import type { Session, User } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";
import { recordSecurityEvent } from "./audit";
import { getBearerToken } from "./bearer";
import { getSessionToken } from "./cookies";
import { resolveSession, touchSession } from "./session";

/**
 * How the caller proved its identity. Cookie callers are browser sessions and
 * stay subject to same-origin checks; bearer callers are extensions, CLIs and
 * third-party clients, which a browser will not attach automatically and which
 * therefore cannot be used for CSRF.
 */
export type AuthSource = "cookie" | "bearer";

export interface AuthContext {
  user: User;
  session: Session;
  token: string;
  via: AuthSource;
}

/**
 * Authenticates a request from an `Authorization: Bearer` token or the session
 * cookie, in that order. Every route calls this itself: middleware is not a
 * security boundary.
 */
export async function requireAuth(
  db: Database,
  request: Request,
): Promise<AuthContext> {
  const bearer = getBearerToken(request);
  const token = bearer ?? getSessionToken(request);
  if (!token) throw AppError.unauthorized();

  const resolution = await resolveSession(db, token);

  if (resolution.status === "reuse") {
    await recordSecurityEvent(db, {
      type: "session.reuse_detected",
      severity: "critical",
      metadata: { sessionId: resolution.sessionId },
    });
    throw AppError.unauthorized("Session is no longer valid");
  }

  if (resolution.status !== "active") {
    throw AppError.unauthorized("Session is no longer valid");
  }

  await touchSession(db, resolution.session);

  return {
    user: resolution.user,
    session: resolution.session,
    token,
    via: bearer ? "bearer" : "cookie",
  };
}
