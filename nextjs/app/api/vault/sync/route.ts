import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseQuery } from "@/lib/http/validate";
import { syncQuerySchema } from "@/lib/vault/schemas";
import { toPublicFolder, toPublicItem } from "@/lib/vault/serializers";
import { syncVault } from "@/lib/vault/service";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const { since } = parseQuery(request, syncQuerySchema);

    const result = await syncVault(
      db,
      user.id,
      since ? new Date(since) : undefined,
    );

    return jsonOk({
      serverTime: result.serverTime.toISOString(),
      items: result.items.map(toPublicItem),
      folders: result.folders.map(toPublicFolder),
    });
  } catch (error) {
    return jsonError(error, { route: "vault/sync" });
  }
}
