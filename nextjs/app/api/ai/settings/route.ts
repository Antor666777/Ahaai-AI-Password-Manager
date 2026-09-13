import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { toSettingsView } from "@/lib/auth/serializers";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { updateSettingsSchema } from "@/lib/ai/schemas";
import { getAiSettings, updateAiSettings } from "@/lib/ai/service";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);

    const settings = await getAiSettings(db, user.id);
    return jsonOk({ settings: toSettingsView(settings) });
  } catch (error) {
    return jsonError(error, { route: "ai/settings" });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const body = await parseJson(request, updateSettingsSchema);

    const settings = await updateAiSettings(db, user.id, body);
    return jsonOk({ settings: toSettingsView(settings) });
  } catch (error) {
    return jsonError(error, { route: "ai/settings" });
  }
}
