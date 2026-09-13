import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { changePasswordSchema } from "@/lib/auth/schemas";
import { changeMasterPassword } from "@/lib/auth/service";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user, session } = await requireAuth(db, request);
    await enforceRateLimit("passwordChange", `user:${user.id}`);
    const body = await parseJson(request, changePasswordSchema);

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
      getRequestContext(request),
    );

    return jsonOk({
      securityStamp: result.securityStamp,
      revokedSessions: result.revokedSessions,
    });
  } catch (error) {
    return jsonError(error, { route: "auth/password" });
  }
}
