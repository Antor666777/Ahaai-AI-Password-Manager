import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { securityEvents, users } from "@ahaai/db/schema";
import {
  createTestApi,
  ENVELOPE,
  registrationBody,
  sessionCookie,
  type RequestOptions,
  type TestApi,
} from "./testing/client";

let api: TestApi;

const get = (path: string, options?: RequestOptions) => api.get(path, options);
const post = (path: string, body?: unknown, options?: RequestOptions) =>
  api.post(path, body, options);

beforeAll(async () => {
  api = await createTestApi();
});

afterAll(async () => {
  await api.close();
});

async function registerAndGetCookie(email: string): Promise<string> {
  const response = await post("/api/v1/auth/register", await registrationBody(email));
  if (response.status !== 201) {
    throw new Error(`registration failed: ${response.status} ${await response.text()}`);
  }
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error("registration did not set a session cookie");
  return cookie;
}

async function createItem(
  cookie: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const response = await post(
    "/api/v1/vault/items",
    { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE, ...extra },
    { cookie },
  );
  expect(response.status).toBe(201);
  return (await response.json()).item;
}

async function createFolder(cookie: string): Promise<string> {
  const response = await post(
    "/api/v1/vault/folders",
    { nameEnc: ENVELOPE },
    { cookie },
  );
  expect(response.status).toBe(201);
  return (await response.json()).folder.id;
}

async function createTag(cookie: string): Promise<string> {
  const response = await post(
    "/api/v1/vault/tags",
    { nameEnc: ENVELOPE },
    { cookie },
  );
  expect(response.status).toBe(201);
  return (await response.json()).tag.id;
}

describe("bulk update route", () => {
  it("trashes, restores, favorites, moves and destroys a batch", async () => {
    const cookie = await registerAndGetCookie("api-bulk-actions@example.com");
    const options = { cookie };
    const folderId = await createFolder(cookie);

    const one = await createItem(cookie);
    const two = await createItem(cookie);

    const trashed = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "trash", ids: [one.id, two.id] },
      options,
    );
    expect(trashed.status).toBe(200);
    const trashedItems = (await trashed.json()).items;
    expect(trashedItems).toHaveLength(2);
    expect(trashedItems.every((item: { deletedAt: string | null }) => item.deletedAt)).toBe(true);
    const trashedRevision = new Map<string, number>(
      trashedItems.map((item: { id: string; revision: number }) => [item.id, item.revision]),
    );

    const restored = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "restore", ids: [one.id, two.id] },
      options,
    );
    expect(restored.status).toBe(200);
    const restoredItems = (await restored.json()).items;
    expect(restoredItems.every((item: { deletedAt: string | null }) => item.deletedAt === null)).toBe(true);
    for (const item of restoredItems as { id: string; revision: number }[]) {
      expect(item.revision).toBeGreaterThan(trashedRevision.get(item.id) as number);
    }

    const favorited = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "favorite", ids: [one.id, two.id], favorite: true },
      options,
    );
    expect(favorited.status).toBe(200);
    expect(
      (await favorited.json()).items.every((item: { favorite: boolean }) => item.favorite),
    ).toBe(true);

    const moved = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "move", ids: [one.id, two.id], folderId },
      options,
    );
    expect(moved.status).toBe(200);
    expect(
      (await moved.json()).items.every(
        (item: { folderId: string | null }) => item.folderId === folderId,
      ),
    ).toBe(true);

    const destroyed = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "destroy", ids: [one.id, two.id] },
      options,
    );
    expect(destroyed.status).toBe(200);
    expect((await destroyed.json()).items).toHaveLength(2);

    expect((await (await get("/api/v1/vault/items", options)).json()).items).toHaveLength(0);
    expect((await get(`/api/v1/vault/items/${one.id}`, options)).status).toBe(404);
  });

  it("echoes tagIds on the returned items", async () => {
    const cookie = await registerAndGetCookie("api-bulk-tags@example.com");
    const tagId = await createTag(cookie);
    const item = await createItem(cookie, { tagIds: [tagId] });

    const response = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "favorite", ids: [item.id], favorite: true },
      { cookie },
    );
    expect(response.status).toBe(200);
    const items = (await response.json()).items;
    expect(items[0].tagIds).toEqual([tagId]);
    expect(Array.isArray(items[0].tagIds)).toBe(true);
  });

  it("returns only the caller's rows and skips another user's ids", async () => {
    const alice = await registerAndGetCookie("api-bulk-skip-a@example.com");
    const bob = await registerAndGetCookie("api-bulk-skip-b@example.com");
    const aliceItem = await createItem(alice);
    const bobItem = await createItem(bob);

    const response = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "trash", ids: [aliceItem.id, bobItem.id] },
      { cookie: bob },
    );
    expect(response.status).toBe(200);
    const items = (await response.json()).items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(bobItem.id);
    expect(items[0].deletedAt).not.toBeNull();

    // Alice's item is untouched and still visible in her own list.
    expect((await (await get(`/api/v1/vault/items/${aliceItem.id}`, { cookie: alice })).json()).item.deletedAt)
      .toBeNull();
  });

  it("rejects a move into a folder the caller does not own and changes nothing", async () => {
    const alice = await registerAndGetCookie("api-bulk-mv-a@example.com");
    const bob = await registerAndGetCookie("api-bulk-mv-b@example.com");
    const aliceFolder = await createFolder(alice);
    const bobItem = await createItem(bob);

    const response = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "move", ids: [bobItem.id], folderId: aliceFolder },
      { cookie: bob },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    const after = (await (await get(`/api/v1/vault/items/${bobItem.id}`, { cookie: bob })).json()).item;
    expect(after.folderId).toBeNull();
    expect(after.revision).toBe(bobItem.revision);
  });

  it("rejects an empty ids array with a 400", async () => {
    const cookie = await registerAndGetCookie("api-bulk-empty@example.com");
    const response = await post(
      "/api/v1/vault/items/bulk-update",
      { action: "trash", ids: [] },
      { cookie },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
  });

  it("rejects malformed bodies with a 400", async () => {
    const cookie = await registerAndGetCookie("api-bulk-malformed@example.com");
    const options = { cookie };
    const id = (await createItem(cookie)).id;

    const cases: unknown[] = [
      { action: "explode", ids: [id] }, // unknown action
      { action: "favorite", ids: [id] }, // missing favorite
      { action: "move", ids: [id] }, // missing folderId
      { action: "trash", ids: ["not-a-uuid"] }, // malformed id
    ];

    for (const body of cases) {
      const response = await post("/api/v1/vault/items/bulk-update", body, options);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("BAD_REQUEST");
    }

    // None of the rejected requests changed anything.
    expect((await (await get(`/api/v1/vault/items/${id}`, options)).json()).item.revision).toBe(1);
  });

  it("audits the action and the changed count", async () => {
    const email = "api-bulk-audit@example.com";
    const cookie = await registerAndGetCookie(email);
    const options = { cookie };
    const one = await createItem(cookie);
    const two = await createItem(cookie);

    await post(
      "/api/v1/vault/items/bulk-update",
      { action: "favorite", ids: [one.id, two.id], favorite: true },
      options,
    );

    // Scope to this user: the suite shares one database and earlier cases emit
    // their own bulk-update events.
    const [user] = await api.ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailNormalized, email));
    expect(user).toBeDefined();

    const events = await api.ctx.db
      .select()
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.type, "vault.items.bulk_updated"),
          eq(securityEvents.userId, user.id),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ action: "favorite", count: 2 });
  });
});
