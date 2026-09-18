import type { Hono } from "hono";
import { recordSecurityEvent } from "@ahaai/core/auth/audit";
import { requireAuth } from "@ahaai/core/auth/guard";
import { getRequestContext } from "@ahaai/core/auth/request-context";
import { jsonCreated, jsonOk } from "@ahaai/core/http/responses";
import { parseIdParam, parseJson, parseQuery } from "@ahaai/core/http/validate";
import { enforceRateLimit } from "@ahaai/core/rate-limit";
import { createItemSchema, folderCreateSchema, folderUpdateSchema, listItemsQuerySchema, syncQuerySchema, updateItemSchema } from "@ahaai/core/vault/schemas";
import { toPublicFolder, toPublicItem } from "@ahaai/core/vault/serializers";
import {
  createFolder,
  createItem,
  deleteFolder,
  getItem,
  listFolders,
  listItems,
  purgeItem,
  restoreItem,
  syncVault,
  trashItem,
  updateFolder,
  updateItem,
} from "@ahaai/core/vault/service";
import type { AppEnv } from "../types";

export function registerVaultRoutes(app: Hono<AppEnv>): void {
  app.get("/vault/items", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("vault", `user:${user.id}`);
    const query = parseQuery(c.req.raw, listItemsQuerySchema);

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
  });

  app.post("/vault/items", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("vault", `user:${user.id}`);
    const body = await parseJson(c.req.raw, createItemSchema);

    const item = await createItem(db, user.id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.created",
      ...getRequestContext(c.req.raw),
      metadata: { itemId: item.id, itemType: item.type },
    });

    return jsonCreated({ item: toPublicItem(item) });
  });

  app.get("/vault/items/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    const item = await getItem(db, user.id, id);
    return jsonOk({ item: toPublicItem(item) });
  });

  app.patch("/vault/items/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));
    const body = await parseJson(c.req.raw, updateItemSchema);

    const item = await updateItem(db, user.id, id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.updated",
      ...getRequestContext(c.req.raw),
      metadata: { itemId: item.id, revision: item.revision },
    });

    return jsonOk({ item: toPublicItem(item) });
  });

  app.delete("/vault/items/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    const item = await trashItem(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.deleted",
      ...getRequestContext(c.req.raw),
      metadata: { itemId: item.id },
    });

    return jsonOk({ item: toPublicItem(item) });
  });

  app.post("/vault/items/:id/restore", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    const item = await restoreItem(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.restored",
      ...getRequestContext(c.req.raw),
      metadata: { itemId: item.id },
    });

    return jsonOk({ item: toPublicItem(item) });
  });

  app.delete("/vault/items/:id/purge", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    await purgeItem(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "vault.item.purged",
      severity: "warning",
      ...getRequestContext(c.req.raw),
      metadata: { itemId: id },
    });

    return jsonOk({ ok: true });
  });

  app.get("/vault/folders", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);

    const rows = await listFolders(db, user.id);
    return jsonOk({ folders: rows.map(toPublicFolder) });
  });

  app.post("/vault/folders", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const body = await parseJson(c.req.raw, folderCreateSchema);

    const folder = await createFolder(db, user.id, body.nameEnc);
    return jsonCreated({ folder: toPublicFolder(folder) });
  });

  app.patch("/vault/folders/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));
    const body = await parseJson(c.req.raw, folderUpdateSchema);

    const folder = await updateFolder(db, user.id, id, body.nameEnc);
    return jsonOk({ folder: toPublicFolder(folder) });
  });

  app.delete("/vault/folders/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    await deleteFolder(db, user.id, id);
    return jsonOk({ ok: true });
  });

  app.get("/vault/sync", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const { since } = parseQuery(c.req.raw, syncQuerySchema);

    const result = await syncVault(db, user.id, since ? new Date(since) : undefined);

    return jsonOk({
      serverTime: result.serverTime.toISOString(),
      items: result.items.map(toPublicItem),
      folders: result.folders.map(toPublicFolder),
    });
  });
}
