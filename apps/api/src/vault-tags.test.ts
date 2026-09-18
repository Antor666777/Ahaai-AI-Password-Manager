import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { securityEvents } from "@ahaai/db/schema";
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
const patch = (path: string, body: unknown, options?: RequestOptions) =>
  api.patch(path, body, options);
const del = (path: string, options?: RequestOptions) => api.del(path, options);

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

async function createTag(cookie: string): Promise<string> {
  const response = await post("/api/v1/vault/tags", { nameEnc: ENVELOPE }, { cookie });
  expect(response.status).toBe(201);
  return (await response.json()).tag.id;
}

describe("tag routes", () => {
  it("runs a tag through create, list, rename and delete", async () => {
    const cookie = await registerAndGetCookie("api-tags@example.com");
    const options = { cookie };

    const created = await post("/api/v1/vault/tags", { nameEnc: ENVELOPE }, options);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const id: string = createdBody.tag.id;
    expect(createdBody.tag.nameEnc).toBe(ENVELOPE);
    expect(typeof createdBody.tag.createdAt).toBe("string");
    expect(typeof createdBody.tag.updatedAt).toBe("string");

    const listed = await get("/api/v1/vault/tags", options);
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.tags).toHaveLength(1);
    expect(listedBody.tags[0].id).toBe(id);

    const renamed = await patch(
      `/api/v1/vault/tags/${id}`,
      { nameEnc: ENVELOPE },
      options,
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).tag.id).toBe(id);

    const deleted = await del(`/api/v1/vault/tags/${id}`, options);
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");

    expect((await (await get("/api/v1/vault/tags", options)).json()).tags).toHaveLength(0);
  });

  it("rejects a malformed tag body", async () => {
    const cookie = await registerAndGetCookie("api-tags-bad@example.com");
    const response = await post("/api/v1/vault/tags", { nameEnc: "not-sealed" }, { cookie });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
  });

  it("keeps one user's tags out of another user's list", async () => {
    const alice = await registerAndGetCookie("api-tags-alice@example.com");
    const bob = await registerAndGetCookie("api-tags-bob@example.com");
    const id = await createTag(alice);

    expect((await (await get("/api/v1/vault/tags", { cookie: bob })).json()).tags)
      .toHaveLength(0);

    const renamed = await patch(
      `/api/v1/vault/tags/${id}`,
      { nameEnc: ENVELOPE },
      { cookie: bob },
    );
    expect(renamed.status).toBe(404);

    const removed = await del(`/api/v1/vault/tags/${id}`, { cookie: bob });
    expect(removed.status).toBe(404);

    // Alice's tag is still there.
    expect((await (await get("/api/v1/vault/tags", { cookie: alice })).json()).tags)
      .toHaveLength(1);
  });

  it("assigns tags to items, filters by tagId and echoes tagIds everywhere", async () => {
    const cookie = await registerAndGetCookie("api-tags-items@example.com");
    const options = { cookie };
    const tagId = await createTag(cookie);

    const created = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE, tagIds: [tagId] },
      options,
    );
    expect(created.status).toBe(201);
    const item = (await created.json()).item;
    expect(item.tagIds).toEqual([tagId]);

    const untagged = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE },
      options,
    );
    expect((await untagged.json()).item.tagIds).toEqual([]);

    const fetched = await get(`/api/v1/vault/items/${item.id}`, options);
    expect((await fetched.json()).item.tagIds).toEqual([tagId]);

    const listed = await get("/api/v1/vault/items", options);
    const items = (await listed.json()).items;
    expect(items.every((entry: { tagIds: string[] }) => Array.isArray(entry.tagIds)))
      .toBe(true);

    const filtered = await get(`/api/v1/vault/items?tagId=${tagId}`, options);
    const filteredItems = (await filtered.json()).items;
    expect(filteredItems).toHaveLength(1);
    expect(filteredItems[0].id).toBe(item.id);

    const synced = await get("/api/v1/vault/sync", options);
    const syncedItems = (await synced.json()).items;
    for (const entry of syncedItems) {
      expect(Array.isArray(entry.tagIds)).toBe(true);
    }

    // Replacing the set and clearing it are both visible in the response.
    const replaced = await patch(
      `/api/v1/vault/items/${item.id}`,
      { revision: 1, tagIds: [] },
      options,
    );
    expect((await replaced.json()).item.tagIds).toEqual([]);
  });

  it("rejects assigning another user's tag with a 4xx and creates nothing", async () => {
    const alice = await registerAndGetCookie("api-tags-own-a@example.com");
    const bob = await registerAndGetCookie("api-tags-own-b@example.com");
    const aliceTag = await createTag(alice);

    const response = await post(
      "/api/v1/vault/items",
      { type: "login", nameEnc: ENVELOPE, dataEnc: ENVELOPE, tagIds: [aliceTag] },
      { cookie: bob },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expect((await (await get("/api/v1/vault/items", { cookie: bob })).json()).items)
      .toHaveLength(0);
  });

  it("audits tag creation, rename and deletion with the tag id", async () => {
    const cookie = await registerAndGetCookie("api-tags-audit@example.com");
    const options = { cookie };
    const id = await createTag(cookie);

    await patch(`/api/v1/vault/tags/${id}`, { nameEnc: ENVELOPE }, options);
    await del(`/api/v1/vault/tags/${id}`, options);

    const events = await api.ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, "vault.tag.created"));
    const forTag = events.filter(
      (event) => (event.metadata as { tagId?: string } | null)?.tagId === id,
    );
    expect(forTag).toHaveLength(1);

    const updated = await api.ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, "vault.tag.updated"));
    expect(
      updated.some(
        (event) => (event.metadata as { tagId?: string } | null)?.tagId === id,
      ),
    ).toBe(true);

    const deleted = await api.ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, "vault.tag.deleted"));
    expect(
      deleted.some(
        (event) => (event.metadata as { tagId?: string } | null)?.tagId === id,
      ),
    ).toBe(true);
  });
});
