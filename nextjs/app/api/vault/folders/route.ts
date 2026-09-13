import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { jsonCreated, jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { folderCreateSchema } from "@/lib/vault/schemas";
import { toPublicFolder } from "@/lib/vault/serializers";
import { createFolder, listFolders } from "@/lib/vault/service";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);

    const rows = await listFolders(db, user.id);
    return jsonOk({ folders: rows.map(toPublicFolder) });
  } catch (error) {
    return jsonError(error, { route: "vault/folders" });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const body = await parseJson(request, folderCreateSchema);

    const folder = await createFolder(db, user.id, body.nameEnc);
    return jsonCreated({ folder: toPublicFolder(folder) });
  } catch (error) {
    return jsonError(error, { route: "vault/folders" });
  }
}
