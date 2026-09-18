import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Folder, Item, ItemRevision, ItemType, Tag } from "@ahaai/db/schema";
import { folders, itemRevisions, itemTags, items, tags } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";

/** History kept per item; older snapshots are pruned as newer ones land. */
export const MAX_REVISIONS_PER_ITEM = 20;
/** Hard ceiling for a single `listItemRevisions` read. */
export const MAX_REVISIONS_LIMIT = 50;

/**
 * An item row together with the ids of the tags assigned to it. Every service
 * call that returns an item returns this shape, so `toPublicItem` can always
 * fill the client's required `tagIds` field instead of leaving it undefined.
 */
export type ItemWithTags = Item & { tagIds: string[] };

export interface ListItemsOptions {
  limit: number;
  cursor?: string;
  type?: ItemType;
  folderId?: string;
  tagId?: string;
  favorite?: boolean;
  includeTrashed?: boolean;
}

export interface ListItemsResult {
  items: ItemWithTags[];
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

/**
 * Every referenced tag must belong to the caller. The check is done once for a
 * set of distinct ids so a create or an update can never link another user's
 * tag, and a foreign id reads as a 404 rather than reaching the foreign key as a
 * 500, exactly as `assertFolderOwnership` does for folders.
 */
async function assertTagOwnership(
  db: Database,
  userId: string,
  tagIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return;

  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, unique)));

  if (rows.length !== unique.length) throw AppError.notFound("Tag not found");
}

async function loadTagIds(db: Database, itemId: string): Promise<string[]> {
  const rows = await db
    .select({ tagId: itemTags.tagId })
    .from(itemTags)
    .where(eq(itemTags.itemId, itemId));
  return rows.map((row) => row.tagId);
}

/**
 * Loads the tag ids for a whole page of items in one query, then groups them in
 * memory. Never one query per item.
 */
async function loadTagIdsByItem(
  db: Database,
  itemIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byItem = new Map<string, string[]>();
  if (itemIds.length === 0) return byItem;

  const rows = await db
    .select({ itemId: itemTags.itemId, tagId: itemTags.tagId })
    .from(itemTags)
    .where(inArray(itemTags.itemId, [...itemIds]));

  for (const row of rows) {
    const existing = byItem.get(row.itemId);
    if (existing) existing.push(row.tagId);
    else byItem.set(row.itemId, [row.tagId]);
  }
  return byItem;
}

function withTagIds(item: Item, tagIds: readonly string[]): ItemWithTags {
  return { ...item, tagIds: [...tagIds] };
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
  if (options.tagId) {
    // A semi-join through the link table: it adds one predicate and composes
    // with the type, folder and favorite filters and with the keyset cursor.
    conditions.push(
      inArray(
        items.id,
        db
          .select({ id: itemTags.itemId })
          .from(itemTags)
          .where(eq(itemTags.tagId, options.tagId)),
      ),
    );
  }
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

  // One query for the whole page, grouped in memory.
  const tagIdsByItem = await loadTagIdsByItem(
    db,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => withTagIds(row, tagIdsByItem.get(row.id) ?? [])),
    nextCursor,
  };
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
): Promise<ItemWithTags> {
  const item = await findItem(db, userId, itemId);
  if (!item) throw AppError.notFound("Item not found");
  return withTagIds(item, await loadTagIds(db, itemId));
}

export interface CreateItemInput {
  id?: string;
  type: ItemType;
  nameEnc: string;
  notesEnc?: string | null;
  dataEnc: string;
  folderId?: string | null;
  tagIds?: string[];
  favorite?: boolean;
  reprompt?: boolean;
}

export async function createItem(
  db: Database,
  userId: string,
  input: CreateItemInput,
): Promise<ItemWithTags> {
  const tagIds = [...new Set(input.tagIds ?? [])];

  // One transaction so the item and its tag links land together: a foreign tag
  // id must not leave the item behind.
  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Database;
    if (input.folderId) {
      await assertFolderOwnership(scoped, userId, input.folderId);
    }
    await assertTagOwnership(scoped, userId, tagIds);

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

    const [item] = await tx.insert(items).values(values).returning();

    if (tagIds.length > 0) {
      await tx
        .insert(itemTags)
        .values(tagIds.map((tagId) => ({ itemId: item.id, tagId })));
    }

    return withTagIds(item, tagIds);
  });
}

/**
 * Bulk import. Every row lands in ONE transaction, so a bad folder or tag
 * reference or a constraint failure rolls the whole batch back rather than
 * leaving a partial import behind. Folder and tag ownership are each checked
 * once for all distinct ids using the same rules as `createItem`.
 */
export async function createItems(
  db: Database,
  userId: string,
  inputs: CreateItemInput[],
): Promise<ItemWithTags[]> {
  if (inputs.length === 0) return [];

  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Database;
    const folderIds = [
      ...new Set(
        inputs
          .map((input) => input.folderId)
          .filter((folderId): folderId is string => Boolean(folderId)),
      ),
    ];
    for (const folderId of folderIds) {
      await assertFolderOwnership(scoped, userId, folderId);
    }

    const tagIdsByInput = inputs.map((input) => [
      ...new Set(input.tagIds ?? []),
    ]);
    await assertTagOwnership(scoped, userId, tagIdsByInput.flat());

    const values = inputs.map((input) => {
      const row: typeof items.$inferInsert = {
        userId,
        type: input.type,
        nameEnc: input.nameEnc,
        notesEnc: input.notesEnc ?? null,
        dataEnc: input.dataEnc,
        folderId: input.folderId ?? null,
        favorite: input.favorite ?? false,
        reprompt: input.reprompt ?? false,
      };
      if (input.id) row.id = input.id;
      return row;
    });

    const created = await tx.insert(items).values(values).returning();

    // Pair each returned row with the tags of the input at the same index; the
    // multi-row insert preserves input order.
    const links = created.flatMap((item, index) =>
      tagIdsByInput[index].map((tagId) => ({ itemId: item.id, tagId })),
    );
    if (links.length > 0) {
      await tx.insert(itemTags).values(links);
    }

    return created.map((item, index) =>
      withTagIds(item, tagIdsByInput[index]),
    );
  });
}

/**
 * A bulk action applied to a set of ids. Mirrors the discriminated union in
 * `vault/schemas.ts`: the boundary guarantees `favorite`/`folderId` are present
 * for the actions that need them, so the service never branches on a missing
 * field.
 */
export type BulkUpdateInput =
  | { action: "trash" | "restore" | "destroy"; ids: string[] }
  | { action: "favorite"; ids: string[]; favorite: boolean }
  | { action: "move"; ids: string[]; folderId: string | null };

/**
 * Applies one action to a batch of items in a single transaction. Every
 * statement is scoped to `userId` in its `WHERE` clause, so an id that does not
 * exist or belongs to another user is silently skipped rather than erroring:
 * the actions are idempotent, a short (or empty) result is normal, and the
 * endpoint never becomes an existence oracle for other users' ids.
 *
 * Returns exactly the rows that changed, each with its `tagIds` loaded, so the
 * caller can apply precisely those rows to local state.
 */
export async function bulkUpdateItems(
  db: Database,
  userId: string,
  input: BulkUpdateInput,
): Promise<ItemWithTags[]> {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) return [];

  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Database;

    // A null folder is a valid unfile; only a referenced folder is checked.
    if (input.action === "move" && input.folderId !== null) {
      await assertFolderOwnership(scoped, userId, input.folderId);
    }

    // The ownership filter lives here, in the WHERE clause of every statement,
    // not as a read-then-write that a concurrent change could race.
    const scope = and(eq(items.userId, userId), inArray(items.id, ids));

    let changed: Item[];
    switch (input.action) {
      case "trash":
        changed = await tx
          .update(items)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
            // Bumped in SQL, exactly like `trashItem`, so the client's
            // optimistic-concurrency counter stays monotonic.
            revision: sql`${items.revision} + 1`,
          })
          .where(scope)
          .returning();
        break;
      case "restore":
        changed = await tx
          .update(items)
          .set({
            deletedAt: null,
            updatedAt: new Date(),
            revision: sql`${items.revision} + 1`,
          })
          .where(scope)
          .returning();
        break;
      case "favorite":
        changed = await tx
          .update(items)
          .set({ favorite: input.favorite, updatedAt: new Date() })
          .where(scope)
          .returning();
        break;
      case "move":
        changed = await tx
          .update(items)
          .set({ folderId: input.folderId, updatedAt: new Date() })
          .where(scope)
          .returning();
        break;
      case "destroy":
        // Hard delete; the foreign-key cascades drop the item's revisions and
        // tag links for us.
        changed = await tx.delete(items).where(scope).returning();
        break;
    }

    // One query for the whole batch, grouped in memory.
    const tagIdsByItem = await loadTagIdsByItem(
      scoped,
      changed.map((row) => row.id),
    );

    return changed.map((row) =>
      withTagIds(row, tagIdsByItem.get(row.id) ?? []),
    );
  });
}

export interface UpdateItemInput {
  revision: number;
  nameEnc?: string;
  notesEnc?: string | null;
  dataEnc?: string;
  folderId?: string | null;
  tagIds?: string[];
  favorite?: boolean;
  reprompt?: boolean;
}

/**
 * Keeps only the newest `MAX_REVISIONS_PER_ITEM` snapshots for one item. The
 * keep-set is chosen by `revision` descending (strictly increasing and unique
 * per item) so pruning is deterministic and immune to timestamp ties.
 */
async function pruneItemRevisions(
  db: Database,
  itemId: string,
): Promise<void> {
  const keep = db
    .select({ id: itemRevisions.id })
    .from(itemRevisions)
    .where(eq(itemRevisions.itemId, itemId))
    .orderBy(desc(itemRevisions.revision))
    .limit(MAX_REVISIONS_PER_ITEM);

  await db
    .delete(itemRevisions)
    .where(
      and(eq(itemRevisions.itemId, itemId), notInArray(itemRevisions.id, keep)),
    );
}

export async function updateItem(
  db: Database,
  userId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<ItemWithTags> {
  // Replace-only-when-present: an absent `tagIds` leaves the item's tags alone,
  // an empty array clears them.
  const replaceTags = input.tagIds !== undefined;
  const tagIds = replaceTags ? [...new Set(input.tagIds ?? [])] : [];

  // One transaction so the snapshot, the overwrite and the tag links land
  // together: a failed tag write must not leave an orphan snapshot or a
  // half-updated item behind.
  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Database;
    const current = await findItem(scoped, userId, itemId);
    if (!current) throw AppError.notFound("Item not found");

    if (current.revision !== input.revision) {
      throw AppError.conflict("Item was modified elsewhere", {
        currentRevision: current.revision,
      });
    }

    if (input.folderId) {
      await assertFolderOwnership(scoped, userId, input.folderId);
    }
    if (replaceTags) {
      await assertTagOwnership(scoped, userId, tagIds);
    }

    // Snapshot the exact row we are about to overwrite, keyed by the revision
    // it held, then trim the history to the newest entries.
    await tx.insert(itemRevisions).values({
      itemId,
      userId,
      revision: current.revision,
      nameEnc: current.nameEnc,
      notesEnc: current.notesEnc,
      dataEnc: current.dataEnc,
    });
    await pruneItemRevisions(scoped, itemId);

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

    const updated = await tx
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

    if (replaceTags) {
      // Replace means delete-then-insert for this item only.
      await tx.delete(itemTags).where(eq(itemTags.itemId, itemId));
      if (tagIds.length > 0) {
        await tx
          .insert(itemTags)
          .values(tagIds.map((tagId) => ({ itemId, tagId })));
      }
    }

    return withTagIds(
      row,
      replaceTags ? tagIds : await loadTagIds(scoped, itemId),
    );
  });
}

export interface ListItemRevisionsOptions {
  limit?: number;
}

/**
 * Snapshots for one item, newest first. Ownership is checked with the same rule
 * as `getItem`, so another user's item reads as a 404 rather than an empty list.
 */
export async function listItemRevisions(
  db: Database,
  userId: string,
  itemId: string,
  options: ListItemRevisionsOptions = {},
): Promise<ItemRevision[]> {
  await getItem(db, userId, itemId);

  const limit = Math.min(
    options.limit ?? MAX_REVISIONS_PER_ITEM,
    MAX_REVISIONS_LIMIT,
  );

  return db
    .select()
    .from(itemRevisions)
    .where(
      and(eq(itemRevisions.itemId, itemId), eq(itemRevisions.userId, userId)),
    )
    .orderBy(desc(itemRevisions.revision))
    .limit(limit);
}

export async function trashItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<ItemWithTags> {
  const current = await findItem(db, userId, itemId);
  if (!current) throw AppError.notFound("Item not found");
  if (current.deletedAt !== null) {
    return withTagIds(current, await loadTagIds(db, itemId));
  }

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
  return withTagIds(row, await loadTagIds(db, itemId));
}

export async function restoreItem(
  db: Database,
  userId: string,
  itemId: string,
): Promise<ItemWithTags> {
  const current = await findItem(db, userId, itemId);
  if (!current) throw AppError.notFound("Item not found");
  if (current.deletedAt === null) {
    return withTagIds(current, await loadTagIds(db, itemId));
  }

  const [row] = await db
    .update(items)
    .set({
      deletedAt: null,
      updatedAt: new Date(),
      revision: sql`${items.revision} + 1`,
    })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning();
  return withTagIds(row, await loadTagIds(db, itemId));
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
  items: ItemWithTags[];
  folders: Folder[];
}

/**
 * Delta sync. Returns items and folders updated after `since`. Soft-deleted
 * items are included as tombstones via their `deletedAt` + bumped `updatedAt`.
 * Hard deletes (purge) require an occasional full resync. An optional `tagId`
 * narrows the item set to one tag, matching the list filter.
 */
export async function syncVault(
  db: Database,
  userId: string,
  since?: Date,
  options: { tagId?: string } = {},
): Promise<SyncResult> {
  const itemConditions: SQL[] = [eq(items.userId, userId)];
  if (since) itemConditions.push(gt(items.updatedAt, since));
  if (options.tagId) {
    itemConditions.push(
      inArray(
        items.id,
        db
          .select({ id: itemTags.itemId })
          .from(itemTags)
          .where(eq(itemTags.tagId, options.tagId)),
      ),
    );
  }

  const folderConditions: SQL[] = [eq(folders.userId, userId)];
  if (since) folderConditions.push(gt(folders.updatedAt, since));

  const [itemRows, folderRows] = await Promise.all([
    db.select().from(items).where(and(...itemConditions)),
    db.select().from(folders).where(and(...folderConditions)),
  ]);

  const tagIdsByItem = await loadTagIdsByItem(
    db,
    itemRows.map((row) => row.id),
  );

  return {
    serverTime: new Date(),
    items: itemRows.map((row) =>
      withTagIds(row, tagIdsByItem.get(row.id) ?? []),
    ),
    folders: folderRows,
  };
}

export async function listTags(db: Database, userId: string): Promise<Tag[]> {
  return db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(desc(tags.createdAt));
}

export async function createTag(
  db: Database,
  userId: string,
  nameEnc: string,
): Promise<Tag> {
  const [tag] = await db.insert(tags).values({ userId, nameEnc }).returning();
  return tag;
}

export async function renameTag(
  db: Database,
  userId: string,
  tagId: string,
  nameEnc: string,
): Promise<Tag> {
  const updated = await db
    .update(tags)
    .set({ nameEnc, updatedAt: new Date() })
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .returning();

  const row = updated[0];
  if (!row) throw AppError.notFound("Tag not found");
  return row;
}

/**
 * Removes a tag and every link to it. The linked items are left untouched,
 * unlike a folder delete, which detaches items by nulling their folder.
 */
export async function deleteTag(
  db: Database,
  userId: string,
  tagId: string,
): Promise<void> {
  const deleted = await db
    .delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .returning({ id: tags.id });

  if (deleted.length === 0) throw AppError.notFound("Tag not found");
}
