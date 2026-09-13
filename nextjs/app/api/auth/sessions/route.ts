import { requireAuth } from "@/lib/auth/guard";
import { toPublicSession } from "@/lib/auth/serializers";
import { listSessions } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user, session } = await requireAuth(db, request);

    const sessions = await listSessions(db, user.id);

    return jsonOk({
      sessions: sessions.map((entry) => toPublicSession(entry, session.id)),
    });
  } catch (error) {
    return jsonError(error, { route: "auth/sessions" });
  }
}
