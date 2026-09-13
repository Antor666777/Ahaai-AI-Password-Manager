import { recordSecurityEvent } from "@/lib/auth/audit";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { requireAuth } from "@/lib/auth/guard";
import { getRequestContext } from "@/lib/auth/request-context";
import { getDb } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { updateProviderSchema } from "@/lib/ai/schemas";
import { toPublicProvider } from "@/lib/ai/serializers";
import { deleteProvider, updateProvider } from "@/lib/ai/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const { id } = await params;
    const body = await parseJson(request, updateProviderSchema);

    const provider = await updateProvider(db, user.id, id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.provider.updated",
      ...getRequestContext(request),
      metadata: { providerId: provider.id },
    });

    return jsonOk({ provider: toPublicProvider(provider) });
  } catch (error) {
    return jsonError(error, { route: "ai/providers/[id]" });
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
    const { id } = await params;

    await deleteProvider(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.provider.deleted",
      severity: "warning",
      ...getRequestContext(request),
      metadata: { providerId: id },
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error, { route: "ai/providers/[id]" });
  }
}
