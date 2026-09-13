import { recordSecurityEvent } from "@/lib/auth/audit";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { purgeItem } from "@/lib/vault/service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const { id } = await params;

    await purgeItem(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.purged",
      severity: "warning",
      ...getRequestContext(request),
      metadata: { itemId: id },
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, { route: "vault/items/[id]/purge" });
  }
}
