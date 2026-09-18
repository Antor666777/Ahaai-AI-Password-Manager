import { recordSecurityEvent } from "@/lib/auth/audit";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseIdParam, parseJson } from "@/lib/http/validate";
import { updateItemSchema } from "@/lib/vault/schemas";
import { toPublicItem } from "@/lib/vault/serializers";
import { getItem, trashItem, updateItem } from "@/lib/vault/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const id = parseIdParam((await params).id);

    const item = await getItem(db, user.id, id);
    return jsonOk({ item: toPublicItem(item) });
  } catch (error) {
    return jsonError(error, { route: "vault/items/[id]" });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const id = parseIdParam((await params).id);
    const body = await parseJson(request, updateItemSchema);

    const item = await updateItem(db, user.id, id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.updated",
      ...getRequestContext(request),
      metadata: { itemId: item.id, revision: item.revision },
    });

    return jsonOk({ item: toPublicItem(item) });
  } catch (error) {
    return jsonError(error, { route: "vault/items/[id]" });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const id = parseIdParam((await params).id);

    const item = await trashItem(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.deleted",
      ...getRequestContext(request),
      metadata: { itemId: item.id },
    });

    return jsonOk({ item: toPublicItem(item) });
  } catch (error) {
    return jsonError(error, { route: "vault/items/[id]" });
  }
}
