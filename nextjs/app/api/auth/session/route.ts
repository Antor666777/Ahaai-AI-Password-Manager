import { requireAuth } from "@/lib/auth/guard";
import { toPublicSession, toPublicUser, toSettingsView } from "@/lib/auth/serializers";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { getSettings } from "@/lib/settings";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user, session } = await requireAuth(db, request);
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
  } catch (error) {
    return jsonError(error, { route: "auth/session" });
  }
}
