import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seal } from "@ahaai/core/crypto/aead";
import { randomBytes, utf8ToBytes } from "@ahaai/core/crypto/encoding";
import { itemTags, items, tags, users } from "@ahaai/db/schema";
import { createTestUser } from "@ahaai/testing/helpers/auth";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import {
  createItem,
  createItems,
  createTag,
  deleteTag,
  getItem,
  listItems,
  listTags,
  purgeItem,
  renameTag,
  syncVault,
  trashItem,
  updateItem,
} from "./service";

const envelope = (label = "data") =>
  seal(randomBytes(32), utf8ToBytes(label), "test");

async function linkCount(db: TestDb["db"], itemId: string): Promise<number> {
  const rows = await db
    .select({ itemId: itemTags.itemId })
    .from(itemTags)
    .where(eq(itemTags.itemId, itemId));
  return rows.length;
}

describe("tag service", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates, lists and renames tags", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-crud@example.com" });

    const first = await createTag(ctx.db, user.id, envelope("work"));
    await createTag(ctx.db, user.id, envelope("personal"));

    expect(first.userId).toBe(user.id);
    expect(first.createdAt).toBeInstanceOf(Date);

    const all = await listTags(ctx.db, user.id);
    expect(all).toHaveLength(2);

    const renamed = await renameTag(
      ctx.db,
      user.id,
      first.id,
      envelope("renamed"),
    );
    expect(renamed.nameEnc).not.toBe(first.nameEnc);
    expect(renamed.id).toBe(first.id);

    await deleteTag(ctx.db, user.id, first.id);
    const remaining = await listTags(ctx.db, user.id);
    expect(remaining.map((tag) => tag.id)).not.toContain(first.id);
    expect(remaining).toHaveLength(1);
  });

  it("isolates tags between users", async () => {
    const alice = await createTestUser(ctx.db, { email: "tag-alice@example.com" });
    const bob = await createTestUser(ctx.db, { email: "tag-bob@example.com" });
    const aliceTag = await createTag(ctx.db, alice.id, envelope("alice"));

    expect(await listTags(ctx.db, bob.id)).toHaveLength(0);

    await expect(
      renameTag(ctx.db, bob.id, aliceTag.id, envelope("hijacked")),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      deleteTag(ctx.db, bob.id, aliceTag.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Alice still owns an untouched tag.
    expect((await listTags(ctx.db, alice.id)).map((tag) => tag.id)).toEqual([
      aliceTag.id,
    ]);
  });

  it("deletes a tag, detaching it from items but leaving the items alive", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-detach@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("temp"));
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });
    expect(await linkCount(ctx.db, item.id)).toBe(1);

    await deleteTag(ctx.db, user.id, tag.id);

    // The link is gone, but the item is very much alive and now untagged.
    expect(await linkCount(ctx.db, item.id)).toBe(0);
    const fetched = await getItem(ctx.db, user.id, item.id);
    expect(fetched.id).toBe(item.id);
    expect(fetched.tagIds).toEqual([]);
  });

  it("assigns tags on create and replaces the whole set on update", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-assign@example.com" });
    const tagA = await createTag(ctx.db, user.id, envelope("a"));
    const tagB = await createTag(ctx.db, user.id, envelope("b"));

    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tagA.id],
    });
    expect(item.tagIds).toEqual([tagA.id]);

    const updated = await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      tagIds: [tagB.id],
    });

    expect(updated.tagIds).toEqual([tagB.id]);
    const stored = await ctx.db
      .select({ tagId: itemTags.tagId })
      .from(itemTags)
      .where(eq(itemTags.itemId, item.id));
    expect(stored.map((row) => row.tagId)).toEqual([tagB.id]);
  });

  it("clears tags with an empty array but leaves them alone when absent", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-clear@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("keep"));

    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });

    const untouched = await updateItem(ctx.db, user.id, item.id, {
      revision: 1,
      favorite: true,
    });
    expect(untouched.tagIds).toEqual([tag.id]);

    const cleared = await updateItem(ctx.db, user.id, item.id, {
      revision: 2,
      tagIds: [],
    });
    expect(cleared.tagIds).toEqual([]);
    expect(await linkCount(ctx.db, item.id)).toBe(0);
  });

  it("rejects a foreign tag on create and rolls the item back", async () => {
    const alice = await createTestUser(ctx.db, { email: "tag-fc-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "tag-fc-b@example.com" });
    const aliceTag = await createTag(ctx.db, alice.id, envelope("alice"));

    await expect(
      createItem(ctx.db, bob.id, {
        type: "login",
        nameEnc: envelope(),
        dataEnc: envelope(),
        tagIds: [aliceTag.id],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    // Nothing survived the rejected transaction.
    expect((await listItems(ctx.db, bob.id, { limit: 100 })).items).toHaveLength(0);
  });

  it("rejects a foreign tag on update and leaves the item untouched", async () => {
    const alice = await createTestUser(ctx.db, { email: "tag-fu-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "tag-fu-b@example.com" });
    const aliceTag = await createTag(ctx.db, alice.id, envelope("alice"));

    const item = await createItem(ctx.db, bob.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    await expect(
      updateItem(ctx.db, bob.id, item.id, {
        revision: 1,
        tagIds: [aliceTag.id],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    // The optimistic revision was not advanced and no link was written.
    const after = await getItem(ctx.db, bob.id, item.id);
    expect(after.revision).toBe(1);
    expect(after.tagIds).toEqual([]);
  });

  it("bulk-creates with per-item tags and rolls the batch back on a foreign id", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-bulk@example.com" });
    const tagA = await createTag(ctx.db, user.id, envelope("a"));
    const tagB = await createTag(ctx.db, user.id, envelope("b"));

    const created = await createItems(ctx.db, user.id, [
      {
        type: "login",
        nameEnc: envelope(),
        dataEnc: envelope(),
        tagIds: [tagA.id],
      },
      {
        type: "card",
        nameEnc: envelope(),
        dataEnc: envelope(),
        tagIds: [tagA.id, tagB.id],
      },
      { type: "secure_note", nameEnc: envelope(), dataEnc: envelope() },
    ]);

    expect(created[0].tagIds).toEqual([tagA.id]);
    expect(created[1].tagIds.sort()).toEqual([tagA.id, tagB.id].sort());
    expect(created[2].tagIds).toEqual([]);

    const alice = await createTestUser(ctx.db, { email: "tag-bulk-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "tag-bulk-b@example.com" });
    const aliceTag = await createTag(ctx.db, alice.id, envelope("alice"));

    await expect(
      createItems(ctx.db, bob.id, [
        { type: "login", nameEnc: envelope(), dataEnc: envelope() },
        {
          type: "login",
          nameEnc: envelope(),
          dataEnc: envelope(),
          tagIds: [aliceTag.id],
        },
      ]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect((await listItems(ctx.db, bob.id, { limit: 100 })).items).toHaveLength(0);
  });

  it("filters the list by tagId and composes with paging and other filters", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-filter@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("filter"));

    const taggedLogin = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
      favorite: true,
    });
    const taggedCard = await createItem(ctx.db, user.id, {
      type: "card",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });
    const untagged = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      favorite: true,
    });

    // Deterministic createdAt so the keyset cursor has a stable order.
    const base = Date.now();
    await ctx.db
      .update(items)
      .set({ createdAt: new Date(base - 2000) })
      .where(eq(items.id, taggedCard.id));
    await ctx.db
      .update(items)
      .set({ createdAt: new Date(base - 1000) })
      .where(eq(items.id, taggedLogin.id));
    await ctx.db
      .update(items)
      .set({ createdAt: new Date(base) })
      .where(eq(items.id, untagged.id));

    const tagged = await listItems(ctx.db, user.id, { limit: 100, tagId: tag.id });
    expect(tagged.items.map((entry) => entry.id).sort()).toEqual(
      [taggedLogin.id, taggedCard.id].sort(),
    );

    expect(untagged.id).not.toBe(taggedLogin.id);
    expect(tagged.items.map((entry) => entry.id)).not.toContain(untagged.id);

    // Composes with the type filter.
    const cards = await listItems(ctx.db, user.id, {
      limit: 100,
      tagId: tag.id,
      type: "card",
    });
    expect(cards.items.map((entry) => entry.id)).toEqual([taggedCard.id]);

    // And with the favorite filter.
    const favorites = await listItems(ctx.db, user.id, {
      limit: 100,
      tagId: tag.id,
      favorite: true,
    });
    expect(favorites.items.map((entry) => entry.id)).toEqual([taggedLogin.id]);

    // And with cursor pagination.
    const firstPage = await listItems(ctx.db, user.id, {
      limit: 1,
      tagId: tag.id,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await listItems(ctx.db, user.id, {
      limit: 1,
      tagId: tag.id,
      cursor: firstPage.nextCursor as string,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  });

  it("returns tagIds on listItems, getItem and syncVault for every item", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-reads@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("read"));

    const tagged = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });
    const plain = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
    });

    const listed = await listItems(ctx.db, user.id, { limit: 100 });
    const byId = new Map(listed.items.map((entry) => [entry.id, entry.tagIds]));
    expect(byId.get(tagged.id)).toEqual([tag.id]);
    expect(byId.get(plain.id)).toEqual([]);
    // Every row carries the field, tagged or not.
    expect(listed.items.every((entry) => Array.isArray(entry.tagIds))).toBe(true);

    expect((await getItem(ctx.db, user.id, tagged.id)).tagIds).toEqual([tag.id]);
    expect((await getItem(ctx.db, user.id, plain.id)).tagIds).toEqual([]);

    const synced = await syncVault(ctx.db, user.id);
    const syncById = new Map(synced.items.map((entry) => [entry.id, entry.tagIds]));
    expect(syncById.get(tagged.id)).toEqual([tag.id]);
    expect(syncById.get(plain.id)).toEqual([]);

    // syncVault also honours the tagId filter.
    const narrowed = await syncVault(ctx.db, user.id, undefined, { tagId: tag.id });
    expect(narrowed.items.map((entry) => entry.id)).toEqual([tagged.id]);
  });

  it("cascades item_tags away when an item is purged", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-cascade-item@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("cascade"));
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });
    expect(await linkCount(ctx.db, item.id)).toBe(1);

    await trashItem(ctx.db, user.id, item.id);
    await purgeItem(ctx.db, user.id, item.id);

    expect(await linkCount(ctx.db, item.id)).toBe(0);
    // The tag itself survives the item delete.
    expect((await listTags(ctx.db, user.id)).map((t) => t.id)).toEqual([tag.id]);
  });

  it("cascades tags and item_tags away when a user is deleted", async () => {
    const user = await createTestUser(ctx.db, { email: "tag-cascade-user@example.com" });
    const tag = await createTag(ctx.db, user.id, envelope("bye"));
    const item = await createItem(ctx.db, user.id, {
      type: "login",
      nameEnc: envelope(),
      dataEnc: envelope(),
      tagIds: [tag.id],
    });
    expect(await linkCount(ctx.db, item.id)).toBe(1);

    await ctx.db.delete(users).where(eq(users.id, user.id));

    const leftoverTags = await ctx.db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.id, tag.id));
    expect(leftoverTags).toHaveLength(0);
    expect(await linkCount(ctx.db, item.id)).toBe(0);
  });
});
