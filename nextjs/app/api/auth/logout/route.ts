import { buildClearSessionCookie } from "@/lib/auth/cookies";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { logoutUser } from "@/lib/auth/service";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user, session } = await requireAuth(db, request);

    await logoutUser(db, session.id, user.id, getRequestContext(request));

    return jsonOk(
      { ok: true },
      { headers: { "set-cookie": buildClearSessionCookie() } },
    );
  } catch (error) {
    return jsonError(error, { route: "auth/logout" });
  }
}
