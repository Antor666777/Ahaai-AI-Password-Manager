import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seal } from "@ahaai/core/crypto/aead";
import { randomBytes, utf8ToBytes } from "@ahaai/core/crypto/encoding";
import { itemRevisions, itemTags, items } from "@ahaai/db/schema";
import { createTestUser } from "@ahaai/testing/helpers/auth";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import {
  bulkUpdateItems,
  createFolder,
  createItem,
  createTag,
  getItem,
  listItems,
  updateItem,
} from "./service";

const envelope = (label = "data") =>
  seal(randomBytes(32), utf8ToBytes(label), "test");

async function revisionCount(db: TestDb["db"], itemId: string): Promise<number> {
  const rows = await db
    .select({ id: itemRevisions.id })
    .from(itemRevisions)
    .where(eq(itemRevisions.itemId, itemId));
  return rows.length;
}

async function linkCount(db: TestDb["db"], itemId: string): Promise<number> {
  const rows = await db
    .select({ itemId: itemTags.itemId })
    .from(itemTags)
    .where(eq(itemTags.itemId, itemId));
  return rows.length;
}

describe("bulk update service", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("trashes a batch and restores it, keeping the revision monotonic", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-up1@example.com" });
    const a = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope("a"),
      dataEnc: envelope(),
    });
    const b = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope("b"),
      dataEnc: envelope(),
    });

    const trashed = await bulkUpdateItems(ctx.db, user.id, {
      action: "trash",
      ids: [a.id, b.id],
    });
    expect(trashed.map((item) => item.id).sort()).toEqual([a.id, b.id].sort());
    expect(trashed.every((item) => item.deletedAt !== null)).toBe(true);

    const trashedRevision = new Map(
      trashed.map((item) => [item.id, item.revision]),
    );
    expect(trashedRevision.get(a.id)).toBeGreaterThan(a.revision);
    expect(trashedRevision.get(b.id)).toBeGreaterThan(b.revision);

    // Trashed rows drop out of the default list.
    expect((await listItems(ctx.db, user.id, { limit: 100 })).items).toHaveLength(0);

    const restored = await bulkUpdateItems(ctx.db, user.id, {
      action: "restore",
      ids: [a.id, b.id],
    });
    expect(restored.every((item) => item.deletedAt === null)).toBe(true);
    for (const item of restored) {
      expect(item.revision).toBeGreaterThan(
        trashedRevision.get(item.id) as number,
      );
    }

    expect((await listItems(ctx.db, user.id, { limit: 100 })).items).toHaveLength(2);
  });

  it("favorites and unfavorites a batch", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-up2@example.com" });
    const a = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    const b = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const favorited = await bulkUpdateItems(ctx.db, user.id, {
      action: "favorite",
      ids: [a.id, b.id],
      favorite: true,
    });
    expect(favorited.every((item) => item.favorite)).toBe(true);

    const cleared = await bulkUpdateItems(ctx.db, user.id, {
      action: "favorite",
      ids: [a.id, b.id],
      favorite: false,
    });
    expect(cleared.every((item) => item.favorite)).toBe(false);
  });

  it("moves a batch into a folder and back out with a null folder", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-up3@example.com" });
    const folder = await createFolder(ctx.db, user.id, envelope("work"));
    const a = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    const b = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const moved = await bulkUpdateItems(ctx.db, user.id, {
      action: "move",
      ids: [a.id, b.id],
      folderId: folder.id,
    });
    expect(moved.every((item) => item.folderId === folder.id)).toBe(true);

    const unfiled = await bulkUpdateItems(ctx.db, user.id, {
      action: "move",
      ids: [a.id, b.id],
      folderId: null,
    });
    expect(unfiled.every((item) => item.folderId === null)).toBe(true);
  });

  it("rejects a move into a folder the caller does not own and changes nothing", async () => {
    const alice = await createTestUser(ctx.db, { email: "bulk-mv-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "bulk-mv-b@example.com" });
    const aliceFolder = await createFolder(ctx.db, alice.id, envelope("alice"));

    const item = await createItem(ctx.db, bob.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    await expect(
      bulkUpdateItems(ctx.db, bob.id, {
        action: "move",
        ids: [item.id],
        folderId: aliceFolder.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    const after = await getItem(ctx.db, bob.id, item.id);
    expect(after.folderId).toBeNull();
    expect(after.revision).toBe(item.revision);
  });

  it("skips ids owned by another user and still changes the caller's own", async () => {
    const alice = await createTestUser(ctx.db, { email: "bulk-skip-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "bulk-skip-b@example.com" });

    const aliceItem = await createItem(ctx.db, alice.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    const bobOne = await createItem(ctx.db, bob.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });
    const bobTwo = await createItem(ctx.db, bob.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const changed = await bulkUpdateItems(ctx.db, bob.id, {
      action: "favorite",
      ids: [bobOne.id, aliceItem.id, bobTwo.id],
      favorite: true,
    });

    // Only Bob's two rows come back; Alice's id is silently skipped.
    expect(changed.map((item) => item.id).sort()).toEqual(
      [bobOne.id, bobTwo.id].sort(),
    );
    expect(changed.every((item) => item.userId === bob.id)).toBe(true);

    // Alice's item is untouched.
    const untouched = await getItem(ctx.db, alice.id, aliceItem.id);
    expect(untouched.favorite).toBe(false);
  });

  it("hard-deletes a batch and cascades revisions and tag links", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-del@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("keep"));
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });

    // Produce a revision so the cascade has something to remove.
    await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      nameEnc: envelope("v2"),
    });
    expect(await revisionCount(ctx.db, item.id)).toBe(1);
    expect(await linkCount(ctx.db, item.id)).toBe(1);

    const destroyed = await bulkUpdateItems(ctx.db, user.id, {
      action: "destroy",
      ids: [item.id],
    });
    expect(destroyed.map((row) => row.id)).toEqual([item.id]);

    await expect(getItem(ctx.db, user.id, item.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await revisionCount(ctx.db, item.id)).toBe(0);
    expect(await linkCount(ctx.db, item.id)).toBe(0);
  });

  it("returns tagIds on every affected row", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-tags@example.com" });
    const tagA = await createTag(ctx.db, user.id, envelope("a"));
    const tagB = await createTag(ctx.db, user.id, envelope("b"));

    const tagged = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tagA.id, tagB.id],
    });
    const plain = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const changed = await bulkUpdateItems(ctx.db, user.id, {
      action: "favorite",
      ids: [tagged.id, plain.id],
      favorite: true,
    });

    const byId = new Map(changed.map((item) => [item.id, item.tagIds]));
    expect(byId.get(tagged.id)?.sort()).toEqual([tagA.id, tagB.id].sort());
    // Every row carries the field, tagged or not.
    expect(byId.get(plain.id)).toEqual([]);
    expect(changed.every((item) => Array.isArray(item.tagIds))).toBe(true);
  });

  it("returns an empty result for an empty id set without touching anything", async () => {
    const user = await createTestUser(ctx.db, { email: "bulk-empty@example.com" });
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    expect(
      await bulkUpdateItems(ctx.db, user.id, { action: "destroy", ids: [] }),
    ).toEqual([]);

    const stillThere = await ctx.db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, item.id));
    expect(stillThere).toHaveLength(1);
  });

  it("only returns rows for the caller's items", async () => {
    const alice = await createTestUser(ctx.db, { email: "bulk-scope-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "bulk-scope-b@example.com" });
    const aliceItem = await createItem(ctx.db, alice.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    // Bob asks to trash Alice's id: nothing matches his scope.
    const changed = await bulkUpdateItems(ctx.db, bob.id, {
      action: "trash",
      ids: [aliceItem.id],
    });
    expect(changed).toEqual([]);

    const untouched = await getItem(ctx.db, alice.id, aliceItem.id);
    expect(untouched.deletedAt).toBeNull();
    expect(untouched.revision).toBe(aliceItem.revision);
  });
});
