import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { recordSecurityEvent } from "@/lib/auth/audit";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchRequestSchema } from "@/lib/ai/search-schemas";
import { searchVault } from "@/lib/ai/search";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    await enforceRateLimit("aiSearch", `user:${user.id}`);
    const body = await parseJson(request, searchRequestSchema);

    const result = await searchVault(db, user.id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.search.performed",
      ...getRequestContext(request),
      metadata: {
        mode: body.mode,
        presetId: result.presetId,
        modelId: result.modelId,
        candidateCount: result.candidateCount,
        matchCount: result.matches.length,
        truncated: result.truncated,
      },
    });

    return jsonOk({
      matches: result.matches,
      modelId: result.modelId,
      presetId: result.presetId,
      isLocal: result.isLocal,
      mode: result.mode,
      truncated: result.truncated,
    });
  } catch (error) {
    return jsonError(error, { route: "ai/search" });
  }
}
