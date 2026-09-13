import { recordSecurityEvent } from "@/lib/auth/audit";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { getDb } from "@/lib/db/client";
import { jsonCreated, jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson, parseQuery } from "@/lib/http/validate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createItemSchema, listItemsQuerySchema } from "@/lib/vault/schemas";
import { toPublicItem } from "@/lib/vault/serializers";
import { createItem, listItems } from "@/lib/vault/service";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);
    await enforceRateLimit("vault", `user:${user.id}`);
    const query = parseQuery(request, listItemsQuerySchema);

    const result = await listItems(db, user.id, {
      limit: query.limit,
      cursor: query.cursor,
      type: query.type,
      folderId: query.folderId,
      favorite: query.favorite,
      includeTrashed: query.includeTrashed,
    });

    return jsonOk({
      items: result.items.map(toPublicItem),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return jsonError(error, { route: "vault/items" });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    await enforceRateLimit("vault", `user:${user.id}`);
    const body = await parseJson(request, createItemSchema);

    const item = await createItem(db, user.id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.created",
      ...getRequestContext(request),
      metadata: { itemId: item.id, itemType: item.type },
    });

    return jsonCreated({ item: toPublicItem(item) });
  } catch (error) {
    return jsonError(error, { route: "vault/items" });
  }
}
