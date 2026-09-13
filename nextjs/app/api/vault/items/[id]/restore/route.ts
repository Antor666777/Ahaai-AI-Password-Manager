import { recordSecurityEvent } from "@/lib/auth/audit";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { toPublicItem } from "@/lib/vault/serializers";
import { restoreItem } from "@/lib/vault/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const { id } = await params;

    const item = await restoreItem(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.restored",
      ...getRequestContext(request),
      metadata: { itemId: item.id },
    });

    return jsonOk({ item: toPublicItem(item) });
  } catch (error) {
    return jsonError(error, { route: "vault/items/[id]/restore" });
  }
}
