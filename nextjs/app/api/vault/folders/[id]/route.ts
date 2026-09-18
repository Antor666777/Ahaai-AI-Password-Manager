import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseIdParam, parseJson } from "@/lib/http/validate";
import { folderUpdateSchema } from "@/lib/vault/schemas";
import { toPublicFolder } from "@/lib/vault/serializers";
import { deleteFolder, updateFolder } from "@/lib/vault/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const id = parseIdParam((await params).id);
    const body = await parseJson(request, folderUpdateSchema);

    const folder = await updateFolder(db, user.id, id, body.nameEnc);
    return jsonOk({ folder: toPublicFolder(folder) });
  } catch (error) {
    return jsonError(error, { route: "vault/folders/[id]" });
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

    await deleteFolder(db, user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, { route: "vault/folders/[id]" });
  }
}
