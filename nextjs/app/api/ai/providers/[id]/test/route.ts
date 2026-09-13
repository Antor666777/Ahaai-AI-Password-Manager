import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { enforceRateLimit } from "@/lib/rate-limit";
import { testProviderConnection } from "@/lib/ai/test-connection";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    await enforceRateLimit("aiProviderTest", `user:${user.id}`);
    const { id } = await params;

    const result = await testProviderConnection(db, user.id, id);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { route: "ai/providers/[id]/test" });
  }
}
