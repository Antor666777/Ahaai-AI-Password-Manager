import { and, desc, eq, gt, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Folder, Item, ItemType } from "@ahaai/db/schema";
import { folders, items } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";

export interface ListItemsOptions {
  limit: number;
  cursor?: string;
  type?: ItemType;
  folderId?: string;
  favorite?: boolean;
  includeTrashed?: boolean;
}

export interface ListItemsResult {
  items: Item[];
  nextCursor: string | null;
}

async function findItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<Item | null> {
  const [row] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function assertFolderOwnership(
  db: Database,
  userId: string,
  folderId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1);
  if (!row) throw AppError.notFound("Folder not found");
}

export async function listItems(
  db: Database,
  userId: string,
  options: ListItemsOptions,
): Promise<ListItemsResult> {
  const conditions: SQL[] = [eq(items.userId, userId)];
  if (!options.includeTrashed) conditions.push(isNull(items.deletedAt));
  if (options.type) conditions.push(eq(items.type, options.type));
  if (options.folderId) conditions.push(eq(items.folderId, options.folderId));
  if (options.favorite !== undefined) {
    conditions.push(eq(items.favorite, options.favorite));
  }
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    // Keyset on (createdAt, id): filtering on createdAt alone skips or repeats
    // rows that share a timestamp, which the sort then orders by id.
    const keyset = or(
      lt(items.createdAt, cursor.createdAt),
      and(eq(items.createdAt, cursor.createdAt), lt(items.id, cursor.id)),
    );
    if (keyset) conditions.push(keyset);
  }

  const rows = await db
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(options.limit);

  const last = rows.at(-1);
  const nextCursor =
    rows.length === options.limit && last
      ? encodeCursor(last.createdAt, last.id)
      : null;

  return { items: rows, nextCursor };
}

interface Cursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

function decodeCursor(cursor: string): Cursor {
  const separator = cursor.lastIndexOf("|");
  const createdAt = separator === -1 ? null : new Date(cursor.slice(0, separator));
  const id = separator === -1 ? "" : cursor.slice(separator + 1);

  if (!createdAt || Number.isNaN(createdAt.getTime()) || id.length === 0) {
    throw AppError.badRequest("Invalid cursor");
  }
  return { createdAt, id };
}

export async function getItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<Item> {
  const item = await findItem(db, userId, itemId);
  if (!item) throw AppError.notFound("Item not found");
  return item;
}

export interface CreateItemInput {
  id?: string;
  type: ItemType;
  nameEnc: string;
  notesEnc?: string | null;
  dataEnc: string;
  folderId?: string | null;
  favorite?: boolean;
  reprompt?: boolean;
}

export async function createItem(
  db: Database,
  userId: string,
  input: CreateItemInput,
): Promise<Item> {
  if (input.folderId) {
    await assertFolderOwnership(db, userId, input.folderId);
  }

  const values: typeof items.$inferInsert = {
    userId,
    type: input.type,
    nameEnc: input.nameEnc,
    notesEnc: input.notesEnc ?? null,
    dataEnc: input.dataEnc,
    folderId: input.folderId ?? null,
    favorite: input.favorite ?? false,
    reprompt: input.reprompt ?? false,
  };
  if (input.id) values.id = input.id;

  const [item] = await db.insert(items).values(values).returning();

  return item;
}

export interface UpdateItemInput {
  revision: number;
  nameEnc?: string;
  notesEnc?: string | null;
  dataEnc?: string;
  folderId?: string | null;
  favorite?: boolean;
  reprompt?: boolean;
}

export async function updateItem(
  db: Database,
  userId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<Item> {
  const current = await findItem(db, userId, itemId);
  if (!current) throw AppError.notFound("Item not found");

  if (current.revision !== input.revision) {
    throw AppError.conflict("Item was modified elsewhere", {
      currentRevision: current.revision,
    });
  }

  if (input.folderId) {
    await assertFolderOwnership(db, userId, input.folderId);
  }

  const patch: Partial<typeof items.$inferInsert> = {
    revision: current.revision + 1,
    updatedAt: new Date(),
  };
  if (input.nameEnc !== undefined) patch.nameEnc = input.nameEnc;
  if (input.notesEnc !== undefined) patch.notesEnc = input.notesEnc;
  if (input.dataEnc !== undefined) patch.dataEnc = input.dataEnc;
  if (input.folderId !== undefined) patch.folderId = input.folderId;
  if (input.favorite !== undefined) patch.favorite = input.favorite;
  if (input.reprompt !== undefined) patch.reprompt = input.reprompt;

  const updated = await db
    .update(items)
    .set(patch)
    .where(
      and(
        eq(items.id, itemId),
        eq(items.userId, userId),
        eq(items.revision, input.revision),
      ),
    )
    .returning();

  const row = updated[0];
  if (!row) {
    throw AppError.conflict("Item was modified elsewhere");
  }
  return row;
}

export async function trashItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<Item> {
  const current = await findItem(db, userId, itemId);
  if (!current) throw AppError.notFound("Item not found");
  if (current.deletedAt !== null) return current;

  const [row] = await db
    .update(items)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      // Bumped in SQL, not from the read above: a concurrent edit between the
      // read and this write must not let the counter go backwards.
      revision: sql`${items.revision} + 1`,
    })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning();
  return row;
}

export async function restoreItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<Item> {
  const current = await findItem(db, userId, itemId);
  if (!current) throw AppError.notFound("Item not found");
  if (current.deletedAt === null) return current;

  const [row] = await db
    .update(items)
    .set({
      deletedAt: null,
      updatedAt: new Date(),
      revision: sql`${items.revision} + 1`,
    })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning();
  return row;
}

export async function purgeItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<void> {
  const current = await findItem(db, userId, itemId);
  if (!current) throw AppError.notFound("Item not found");
  if (current.deletedAt === null) {
    throw AppError.badRequest("Item must be moved to trash before purging");
  }

  await db.delete(items).where(and(eq(items.id, itemId), eq(items.userId, userId)));
}

export async function listFolders(
  db: Database,
  userId: string,
): Promise<Folder[]> {
  return db
    .select()
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(desc(folders.createdAt));
}

export async function createFolder(
  db: Database,
  userId: string,
  nameEnc: string,
): Promise<Folder> {
  const [folder] = await db
    .insert(folders)
    .values({ userId, nameEnc })
    .returning();
  return folder;
}

export async function updateFolder(
  db: Database,
  userId: string,
  folderId: string,
  nameEnc: string,
): Promise<Folder> {
  const updated = await db
    .update(folders)
    .set({ nameEnc, updatedAt: new Date() })
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning();

  const row = updated[0];
  if (!row) throw AppError.notFound("Folder not found");
  return row;
}

export async function deleteFolder(
  db: Database,
  userId: string,
  folderId: string,
): Promise<void> {
  const deleted = await db
    .delete(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning({ id: folders.id });

  if (deleted.length === 0) throw AppError.notFound("Folder not found");
}

export interface SyncResult {
  serverTime: Date;
  items: Item[];
  folders: Folder[];
}

/**
 * Delta sync. Returns items and folders updated after `since`. Soft-deleted
 * items are included as tombstones via their `deletedAt` + bumped `updatedAt`.
 * Hard deletes (purge) require an occasional full resync.
 */
export async function syncVault(
  db: Database,
  userId: string,
  since?: Date,
): Promise<SyncResult> {
  const itemConditions: SQL[] = [eq(items.userId, userId)];
  if (since) itemConditions.push(gt(items.updatedAt, since));

  const folderConditions: SQL[] = [eq(folders.userId, userId)];
  if (since) folderConditions.push(gt(folders.updatedAt, since));

  const [itemRows, folderRows] = await Promise.all([
    db.select().from(items).where(and(...itemConditions)),
    db.select().from(folders).where(and(...folderConditions)),
  ]);

  return { serverTime: new Date(), items: itemRows, folders: folderRows };
}
