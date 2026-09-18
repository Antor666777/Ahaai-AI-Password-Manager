import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seal } from "@ahaai/core/crypto/aead";
import { randomBytes, utf8ToBytes } from "@ahaai/core/crypto/encoding";
import { itemRevisions, items } from "@ahaai/db/schema";
import { createTestUser } from "@ahaai/testing/helpers/auth";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import {
  MAX_REVISIONS_PER_ITEM,
  createFolder,
  createItem,
  createItems,
  deleteFolder,
  getItem,
  listFolders,
  listItemRevisions,
  listItems,
  purgeItem,
  restoreItem,
  syncVault,
  trashItem,
  updateFolder,
  updateItem,
} from "./service";

const envelope = (label = "data") =>
  seal(randomBytes(32), utf8ToBytes(label), "test");

describe("vault service", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates and reads back an item", async () => {
    const user = await createTestUser(ctx.db, { email: "v1@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope("name"),
      dataEnc: envelope("secret"),
      notesEnc: envelope("note"),
    });

    expect(item.userId).toBe(user.id);
    expect(item.revision).toBe(1);
    expect(item.favorite).toBe(false);

    const fetched = await getItem(ctx.db, user.id, item.id);
    expect(fetched.nameEnc).toBe(item.nameEnc);
  });

  it("isolates items between users", async () => {
    const alice = await createTestUser(ctx.db, { email: "alice@example.com" });
    const bob = await createTestUser(ctx.db, { email: "bob@example.com" });
    const item = await createItem(ctx.db, alice.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    await expect(getItem(ctx.db, bob.id, item.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const bobList = await listItems(ctx.db, bob.id, { limit: 100 });
    expect(bobList.items).toHaveLength(0);
  });

  it("updates with optimistic concurrency", async () => {
    const user = await createTestUser(ctx.db, { email: "v2@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope("one"),
      dataEnc: envelope(),
    });

    const updated = await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      nameEnc: envelope("two"),
      favorite: true,
    });
    expect(updated.revision).toBe(2);
    expect(updated.favorite).toBe(true);
    expect(updated.nameEnc).not.toBe(item.nameEnc);

    await expect(
      updateItem(ctx.db, user.id, item.id, { revision: 1, favorite: false }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("rejects referencing a folder owned by another user", async () => {
    const alice = await createTestUser(ctx.db, { email: "alice2@example.com" });
    const bob = await createTestUser(ctx.db, { email: "bob2@example.com" });
    const folder = await createFolder(ctx.db, alice.id, envelope("folder"));

    await expect(
      createItem(ctx.db, bob.id, {
        type: "login",
        nameEnc: envelope(),
        dataEnc: envelope(),
        folderId: folder.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("filters the list by type, favorite and folder", async () => {
    const user = await createTestUser(ctx.db, { email: "v3@example.com" });
    const folder = await createFolder(ctx.db, user.id, envelope("work"));

    await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      favorite: true,
    });
    await createItem(ctx.db, user.id, {
      type: "card",
      nameEnc: envelope(),
      dataEnc: envelope(),
      folderId: folder.id,
    });
    await createItem(ctx.db, user.id, {
      type: "secure_note",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    expect(
      (await listItems(ctx.db, user.id, { limit: 100, type: "card" })).items,
    ).toHaveLength(1);
    expect(
      (await listItems(ctx.db, user.id, { limit: 100, favorite: true })).items,
    ).toHaveLength(1);
    expect(
      (await listItems(ctx.db, user.id, { limit: 100, folderId: folder.id })).items,
    ).toHaveLength(1);
  });

  it("paginates with a cursor", async () => {
    const user = await createTestUser(ctx.db, { email: "v4@example.com" });
    const created = [];
    for (let i = 0; i < 3; i += 1) {
      created.push(
        await createItem(ctx.db, user.id, {
          type: "login",
          nameEnc: envelope(`item-${i}`),
          dataEnc: envelope(),
        }),
      );
    }
    const base = Date.now();
    for (let i = 0; i < created.length; i += 1) {
      await ctx.db
        .update(items)
        .set({ createdAt: new Date(base - (created.length - i) * 1000) })
        .where(eq(items.id, created[i].id));
    }

    const firstPage = await listItems(ctx.db, user.id, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listItems(ctx.db, user.id, {
      limit: 2,
      cursor: firstPage.nextCursor as string,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("pages past rows that share a timestamp without skipping any", async () => {
    const user = await createTestUser(ctx.db, { email: "v9@example.com" });
    const created = [];
    for (let i = 0; i < 5; i += 1) {
      created.push(
        await createItem(ctx.db, user.id, {
          type: "login",
          nameEnc: envelope(`same-${i}`),
          dataEnc: envelope(),
        }),
      );
    }

    // Every row lands on the same createdAt, so only the id tiebreak separates
    // them. A cursor that keys on createdAt alone loses rows here.
    const sameMoment = new Date();
    for (const item of created) {
      await ctx.db
        .update(items)
        .set({ createdAt: sameMoment })
        .where(eq(items.id, item.id));
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await listItems(ctx.db, user.id, { limit: 2, cursor });
      seen.push(...page.items.map((entry) => entry.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen).toHaveLength(created.length);
    expect(new Set(seen).size).toBe(created.length);
    expect([...seen].sort()).toEqual(created.map((entry) => entry.id).sort());
  });

  it("keeps the revision monotonic across trash and restore", async () => {
    const user = await createTestUser(ctx.db, { email: "v10@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const trashed = await trashItem(ctx.db, user.id, item.id);
    expect(trashed.revision).toBeGreaterThan(item.revision);

    const restored = await restoreItem(ctx.db, user.id, item.id);
    expect(restored.revision).toBeGreaterThan(trashed.revision);

    // A writer holding the pre-trash revision must be turned away, not allowed
    // to overwrite the newer row.
    await expect(
      updateItem(ctx.db, user.id, item.id, {
        revision: item.revision,
        favorite: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("moves items to trash, restores and purges them", async () => {
    const user = await createTestUser(ctx.db, { email: "v5@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const trashed = await trashItem(ctx.db, user.id, item.id);
    expect(trashed.deletedAt).not.toBeNull();

    expect((await listItems(ctx.db, user.id, { limit: 100 })).items).toHaveLength(0);
    expect(
      (await listItems(ctx.db, user.id, { limit: 100, includeTrashed: true })).items,
    ).toHaveLength(1);

    const restored = await restoreItem(ctx.db, user.id, item.id);
    expect(restored.deletedAt).toBeNull();

    // A live item cannot be permanently deleted.
    await expect(purgeItem(ctx.db, user.id, item.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await trashItem(ctx.db, user.id, item.id);
    await purgeItem(ctx.db, user.id, item.id);
    await expect(getItem(ctx.db, user.id, item.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("manages folders and detaches items on folder delete", async () => {
    const user = await createTestUser(ctx.db, { email: "v6@example.com" });
    const folder = await createFolder(ctx.db, user.id, envelope("old"));

    const renamed = await updateFolder(
      ctx.db,
      user.id,
      folder.id,
      envelope("new"),
    );
    expect(renamed.nameEnc).not.toBe(folder.nameEnc);

    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      folderId: folder.id,
    });

    await deleteFolder(ctx.db, user.id, folder.id);

    expect(await listFolders(ctx.db, user.id)).toHaveLength(0);
    const fetched = await getItem(ctx.db, user.id, item.id);
    expect(fetched.folderId).toBeNull();
  });

  it("syncs changes since a timestamp, including tombstones", async () => {
    const user = await createTestUser(ctx.db, { email: "v7@example.com" });

    const oldItem = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    const past = new Date(Date.now() - 60_000);
    await ctx.db
      .update(items)
      .set({ createdAt: past, updatedAt: past })
      .where(eq(items.id, oldItem.id));

    const since = new Date();

    const freshItem = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    await trashItem(ctx.db, user.id, freshItem.id);

    const result = await syncVault(ctx.db, user.id, since);
    const ids = result.items.map((entry) => entry.id);

    expect(ids).toContain(freshItem.id);
    expect(ids).not.toContain(oldItem.id);

    const tombstone = result.items.find((entry) => entry.id === freshItem.id);
    expect(tombstone?.deletedAt).not.toBeNull();
    expect(result.serverTime.getTime()).toBeGreaterThanOrEqual(since.getTime());
  });

  it("returns everything on a full sync", async () => {
    const user = await createTestUser(ctx.db, { email: "v8@example.com" });
    await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    await createFolder(ctx.db, user.id, envelope("f"));

    const result = await syncVault(ctx.db, user.id);
    expect(result.items).toHaveLength(1);
    expect(result.folders).toHaveLength(1);
  });

  it("bulk-creates items in one transaction and returns them in order", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk1@example.com" });
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];

    const created = await createItems(
      ctx.db,
      user.id,
      ids.map((id, index) => ({
        id,
        type: "login" as const,
        nameEnc: envelope(`name-${index}`),
        dataEnc: envelope(`data-${index}`),
        favorite: index === 0,
      })),
    );

    expect(created.map((item) => item.id)).toEqual(ids);
    expect(created.every((item) => item.userId === user.id)).toBe(true);
    expect(created.every((item) => item.revision === 1)).toBe(true);
    expect(created[0].favorite).toBe(true);

    const listed = await listItems(ctx.db, user.id, { limit: 100 });
    expect(listed.items).toHaveLength(3);
  });

  it("rolls the whole batch back when a folder is not owned by the caller", async () => {
    const alice = await createTestUser(ctx.db, {
      email: "bulk-alice@example.com",
    });
    const bob = await createTestUser(ctx.db, { email: "bulk-bob@example.com" });
    const folder = await createFolder(ctx.db, alice.id, envelope("alice-folder"));

    await expect(
      createItems(ctx.db, bob.id, [
        { type: "login", nameEnc: envelope(), dataEnc: envelope() },
        {
          type: "login",
          nameEnc: envelope(),
          dataEnc: envelope(),
          folderId: folder.id,
        },
      ]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The first, folder-free row must not survive the failed transaction.
    expect(
      (await listItems(ctx.db, bob.id, { limit: 100 })).items,
    ).toHaveLength(0);
  });

  it("bulk-creates into a folder the caller owns", async () => {
    const user = await createTestUser(ctx.db, {
      email: "bulk-folder@example.com",
    });
    const folder = await createFolder(ctx.db, user.id, envelope("mine"));

    const created = await createItems(ctx.db, user.id, [
      {
        type: "card",
        nameEnc: envelope(),
        dataEnc: envelope(),
        folderId: folder.id,
      },
      {
        type: "secure_note",
        nameEnc: envelope(),
        dataEnc: envelope(),
        folderId: folder.id,
      },
    ]);

    expect(created).toHaveLength(2);
    expect(created.every((item) => item.folderId === folder.id)).toBe(true);
    expect(
      (
        await listItems(ctx.db, user.id, { limit: 100, folderId: folder.id })
      ).items,
    ).toHaveLength(2);
  });

  it("returns an empty list for an empty batch", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-empty@example.com" });
    expect(await createItems(ctx.db, user.id, [])).toEqual([]);
  });
});

describe("item revisions", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("snapshots the prior row on update but not on trash or restore", async () => {
    const user = await createTestUser(ctx.db, { email: "rev1@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope("v1-name"),
      dataEnc: envelope("v1-data"),
      notesEnc: envelope("v1-notes"),
    });

    // A fresh item has no history; nothing has been overwritten yet.
    expect(await listItemRevisions(ctx.db, user.id, item.id)).toHaveLength(0);

    await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      nameEnc: envelope("v2-name"),
    });

    const revisions = await listItemRevisions(ctx.db, user.id, item.id);
    expect(revisions).toHaveLength(1);

    const [snapshot] = revisions;
    expect(snapshot.itemId).toBe(item.id);
    expect(snapshot.userId).toBe(user.id);
    expect(snapshot.revision).toBe(1);
    expect(snapshot.nameEnc).toBe(item.nameEnc);
    expect(snapshot.notesEnc).toBe(item.notesEnc);
    expect(snapshot.dataEnc).toBe(item.dataEnc);
    expect(snapshot.createdAt).toBeInstanceOf(Date);

    // Trash and restore change no content, so they add no snapshots.
    await trashItem(ctx.db, user.id, item.id);
    await restoreItem(ctx.db, user.id, item.id);
    expect(await listItemRevisions(ctx.db, user.id, item.id)).toHaveLength(1);
  });

  it("keeps exactly the newest twenty revisions and drops the oldest", async () => {
    const user = await createTestUser(ctx.db, { email: "rev2@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope("start"),
      dataEnc: envelope("start"),
    });

    // 25 updates write 25 snapshots (revisions 1..25) before the cap applies.
    for (let revision = 1; revision <= 25; revision += 1) {
      await updateItem(ctx.db, user.id, item.id, {
        revision,
        nameEnc: envelope(`v${revision + 1}`),
      });
    }

    const revisions = await listItemRevisions(ctx.db, user.id, item.id);
    expect(revisions).toHaveLength(MAX_REVISIONS_PER_ITEM);
    // Newest first, and the newest twenty of the 25 written.
    expect(revisions.map((entry) => entry.revision)).toEqual(
      Array.from({ length: MAX_REVISIONS_PER_ITEM }, (_, index) => 25 - index),
    );
    expect(revisions.at(-1)?.revision).toBe(6);

    // The read honours a smaller limit without reordering.
    const limited = await listItemRevisions(ctx.db, user.id, item.id, {
      limit: 5,
    });
    expect(limited.map((entry) => entry.revision)).toEqual([25, 24, 23, 22, 21]);
  });

  it("scopes revisions to the owning user", async () => {
    const alice = await createTestUser(ctx.db, { email: "rev-alice@example.com" });
    const bob = await createTestUser(ctx.db, { email: "rev-bob@example.com" });
    const item = await createItem(ctx.db, alice.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    await updateItem(ctx.db, alice.id, item.id, {
      revision: 1,
      nameEnc: envelope(),
    });

    await expect(
      listItemRevisions(ctx.db, bob.id, item.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await listItemRevisions(ctx.db, alice.id, item.id)).toHaveLength(1);
  });

  it("removes revisions through the cascade when an item is purged", async () => {
    const user = await createTestUser(ctx.db, { email: "rev3@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      nameEnc: envelope(),
    });
    await updateItem(ctx.db, user.id, item.id, {
      revision: 2,
      nameEnc: envelope(),
    });
    expect(await listItemRevisions(ctx.db, user.id, item.id)).toHaveLength(2);

    await trashItem(ctx.db, user.id, item.id);
    await purgeItem(ctx.db, user.id, item.id);

    const rows = await ctx.db
      .select()
      .from(itemRevisions)
      .where(eq(itemRevisions.itemId, item.id));
    expect(rows).toHaveLength(0);
  });

  it("recovers an old snapshot's exact ciphertext and restoring it snapshots the replaced version", async () => {
    const user = await createTestUser(ctx.db, { email: "rev4@example.com" });

    const v1Name = envelope("v1-name");
    const v1Data = envelope("v1-data");
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: v1Name,
      dataEnc: v1Data,
    });

    await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      nameEnc: envelope("v2-name"),
      dataEnc: envelope("v2-data"),
    });
    await updateItem(ctx.db, user.id, item.id, {
      revision: 2,
      nameEnc: envelope("v3-name"),
    });

    const stored = await listItemRevisions(ctx.db, user.id, item.id);
    const snapshotV1 = stored.find((entry) => entry.revision === 1);
    expect(snapshotV1).toBeDefined();
    // The bytes are reused verbatim: no re-seal, so the AAD still matches.
    expect(snapshotV1?.nameEnc).toBe(v1Name);
    expect(snapshotV1?.dataEnc).toBe(v1Data);

    // Restoring is an ordinary update: it carries the optimistic revision the
    // current row holds and snapshots the version it replaces.
    const restored = await updateItem(ctx.db, user.id, item.id, {
      revision: 3,
      nameEnc: snapshotV1?.nameEnc as string,
      notesEnc: snapshotV1?.notesEnc ?? null,
      dataEnc: snapshotV1?.dataEnc as string,
    });
    expect(restored.revision).toBe(4);
    expect(restored.nameEnc).toBe(v1Name);
    expect(restored.dataEnc).toBe(v1Data);

    const after = await listItemRevisions(ctx.db, user.id, item.id);
    expect(after.map((entry) => entry.revision)).toEqual([3, 2, 1]);
    // The newest snapshot is v3, the version the restore displaced.
    expect(after[0].revision).toBe(3);
  });
});
