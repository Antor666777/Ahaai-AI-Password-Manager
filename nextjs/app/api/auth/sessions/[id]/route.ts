import { and, eq } from "drizzle-orm";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { recordSecurityEvent } from "@/lib/auth/audit";
import { revokeSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { AppError } from "@/lib/http/errors";
import { jsonError, jsonOk } from "@/lib/http/responses";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user, session } = await requireAuth(db, request);
    const { id } = await params;

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
      ...getRequestContext(request),
      metadata: { sessionId: target.id },
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, { route: "auth/sessions/[id]" });
  }
}
