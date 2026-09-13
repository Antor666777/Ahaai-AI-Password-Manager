import type { Session, User } from "@/lib/db/schema";
import type { Database } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { recordSecurityEvent } from "./audit";
import { getSessionToken } from "./cookies";
import { resolveSession, touchSession } from "./session";

export interface AuthContext {
  user: User;
  session: Session;
  token: string;
}

/**
 * Authenticates a request from its session cookie. Every route handler calls
 * this itself: proxy/middleware is not a security boundary.
 */
export async function requireAuth(
  db: Database,
  request: Request,
): Promise<AuthContext> {
  const token = getSessionToken(request);
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
  };
}
