import { recordSecurityEvent } from "@/lib/auth/audit";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { getDb } from "@/lib/db/client";
import { jsonCreated, jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { createProviderSchema } from "@/lib/ai/schemas";
import { toPublicProvider } from "@/lib/ai/serializers";
import { createProvider, listProviders } from "@/lib/ai/service";
import { listPresets } from "@/lib/ai/presets";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);

    const providers = await listProviders(db, user.id);

    return jsonOk({
      providers: providers.map(toPublicProvider),
      presets: listPresets(),
    });
  } catch (error) {
    return jsonError(error, { route: "ai/providers" });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const body = await parseJson(request, createProviderSchema);

    const provider = await createProvider(db, user.id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.provider.created",
      ...getRequestContext(request),
      metadata: { providerId: provider.id, presetId: provider.presetId },
    });

    return jsonCreated({ provider: toPublicProvider(provider) });
  } catch (error) {
    return jsonError(error, { route: "ai/providers" });
  }
}
