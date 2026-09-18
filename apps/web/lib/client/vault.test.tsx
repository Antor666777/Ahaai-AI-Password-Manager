// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openString, sealString } from "@ahaai/core/crypto/aead";
import { sealItem } from "./crypto";
import type { ApiItem, ItemPayload, ItemType } from "./types";

// The provider is the only consumer of the api surface, so the whole module is
// replaced with the calls the vault actually makes.
vi.mock("./api", () => ({
  api: {
    items: vi.fn(),
    folders: vi.fn(),
    tags: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    bulkUpdateItems: vi.fn(),
  },
}));

vi.mock("./session", () => ({
  useSession: () => ({
    vaultKey: VAULT_KEY,
    settings: null,
    user: { id: "u1", email: "user@example.com" },
  }),
}));

import { api } from "./api";
import { useVault, VaultProvider } from "./vault";

const VAULT_KEY = new Uint8Array(32).fill(7);
const NOW = "2026-01-01T00:00:00.000Z";
const TAG_AAD = "ahaai:tag:v1";

const mocked = vi.mocked(api);

let latest: ReturnType<typeof useVault>;

/**
 * Publishes the live provider value to the test. It has to be assigned in an
 * effect rather than during render, which the hooks lint rules reject.
 */
function Probe() {
  const vault = useVault();
  useEffect(() => {
    latest = vault;
  });
  return null;
}

async function mount() {
  render(
    <VaultProvider>
      <Probe />
    </VaultProvider>,
  );
  await waitFor(() => expect(latest.loading).toBe(false));
}

function makeApiItem(opts: {
  id: string;
  name: string;
  type?: ItemType;
  data?: ItemPayload;
  notes?: string;
  folderId?: string | null;
  tagIds?: string[];
  favorite?: boolean;
  reprompt?: boolean;
  deletedAt?: string | null;
  revision?: number;
}): ApiItem {
  const sealed = sealItem(VAULT_KEY, opts.id, {
    name: opts.name,
    notes: opts.notes ?? "",
    data: opts.data ?? { username: "u", password: "p" },
  });
  return {
    id: opts.id,
    type: opts.type ?? "login",
    nameEnc: sealed.nameEnc,
    notesEnc: sealed.notesEnc,
    dataEnc: sealed.dataEnc,
    folderId: opts.folderId ?? null,
    tagIds: opts.tagIds ?? [],
    favorite: opts.favorite ?? false,
    reprompt: opts.reprompt ?? false,
    revision: opts.revision ?? 1,
    deletedAt: opts.deletedAt ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.items.mockResolvedValue({ items: [], nextCursor: null });
  mocked.folders.mockResolvedValue({ folders: [] });
  mocked.tags.mockResolvedValue({ tags: [] });
});

afterEach(() => {
  cleanup();
});

describe("reprompt and tagIds plumbing", () => {
  it("preserves reprompt when a favourite is toggled (regression)", async () => {
    mocked.items.mockResolvedValue({
      items: [makeApiItem({ id: "i1", name: "GitHub", reprompt: true })],
      nextCursor: null,
    });
    await mount();
    expect(latest.items[0].reprompt).toBe(true);

    mocked.updateItem.mockImplementation(async (id, input) => ({
      item: makeApiItem({
        id,
        name: "GitHub",
        reprompt: input.reprompt ?? false,
        favorite: input.favorite ?? false,
      }),
    }));

    await act(async () => {
      await latest.setFavorite("i1", true);
    });

    // The partial patch must carry the protection flag, or the toggle clears it.
    const [, patch] = mocked.updateItem.mock.calls.at(-1)!;
    expect(patch).toMatchObject({ favorite: true, reprompt: true });
    expect(latest.items[0].favorite).toBe(true);
    expect(latest.items[0].reprompt).toBe(true);
  });

  it("sends reprompt and tagIds when creating an item", async () => {
    await mount();
    mocked.createItem.mockImplementation(async (input) => ({
      item: makeApiItem({
        id: input.id!,
        name: "New",
        reprompt: input.reprompt,
        tagIds: input.tagIds,
      }),
    }));

    let created: Awaited<ReturnType<typeof latest.createItem>> | undefined;
    await act(async () => {
      created = await latest.createItem({
        type: "login",
        name: "New",
        notes: "",
        data: { password: "p" },
        folderId: null,
        favorite: false,
        reprompt: true,
        tagIds: ["t1", "t2"],
      });
    });

    expect(mocked.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ reprompt: true, tagIds: ["t1", "t2"] }),
    );
    expect(created?.reprompt).toBe(true);
    expect(created?.tagIds).toEqual(["t1", "t2"]);
  });

  it("sends reprompt and tagIds on update, and omits an absent tagIds", async () => {
    mocked.items.mockResolvedValue({
      items: [makeApiItem({ id: "i1", name: "GitHub", tagIds: ["t1"] })],
      nextCursor: null,
    });
    await mount();

    mocked.updateItem.mockImplementation(async (id, input) => ({
      item: makeApiItem({
        id,
        name: "GitHub",
        reprompt: input.reprompt ?? false,
        tagIds: input.tagIds ?? ["t1"],
      }),
    }));

    const draft = (tagIds?: string[]) => ({
      type: "login" as const,
      name: "GitHub",
      notes: "",
      data: { password: "p" },
      folderId: null,
      favorite: false,
      reprompt: true,
      tagIds,
    });

    await act(async () => {
      await latest.updateItem("i1", draft(["t9"]));
    });
    let patch = mocked.updateItem.mock.calls.at(-1)![1];
    expect(patch).toMatchObject({ reprompt: true, tagIds: ["t9"] });

    await act(async () => {
      await latest.updateItem("i1", draft());
    });
    patch = mocked.updateItem.mock.calls.at(-1)![1];
    expect(patch).toMatchObject({ reprompt: true });
    // Absent must mean "leave the tags alone", so the key is not present at all
    // (and never empty, which the API would read as "clear the tags").
    expect("tagIds" in patch).toBe(false);
  });
});

describe("tag state and CRUD", () => {
  it("decrypts tag names into state and degrades an unreadable one", async () => {
    mocked.tags.mockResolvedValue({
      tags: [
        {
          id: "t1",
          nameEnc: sealString(VAULT_KEY, "Work", TAG_AAD),
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: "t2",
          nameEnc: "not-an-envelope",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    await mount();

    expect(latest.tags.find((tag) => tag.id === "t1")?.name).toBe("Work");
    expect(latest.tags.find((tag) => tag.id === "t2")?.name).toBe(
      "Untitled tag",
    );
  });

  it("creates a tag, sealing its name with the constant AAD", async () => {
    await mount();
    mocked.createTag.mockImplementation(async (nameEnc) => ({
      tag: { id: "t3", nameEnc, createdAt: NOW, updatedAt: NOW },
    }));

    await act(async () => {
      await latest.createTag("Personal");
    });

    const [nameEnc] = mocked.createTag.mock.calls.at(-1)!;
    expect(openString(VAULT_KEY, nameEnc, TAG_AAD)).toBe("Personal");
    expect(latest.tags).toContainEqual(
      expect.objectContaining({ id: "t3", name: "Personal" }),
    );
  });

  it("renames a tag in state and re-seals the new name", async () => {
    mocked.tags.mockResolvedValue({
      tags: [
        {
          id: "t1",
          nameEnc: sealString(VAULT_KEY, "Work", TAG_AAD),
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    await mount();
    mocked.renameTag.mockResolvedValue({
      tag: { id: "t1", nameEnc: "ignored", createdAt: NOW, updatedAt: NOW },
    });

    await act(async () => {
      await latest.renameTag("t1", "Office");
    });

    const [, nameEnc] = mocked.renameTag.mock.calls.at(-1)!;
    expect(openString(VAULT_KEY, nameEnc, TAG_AAD)).toBe("Office");
    expect(latest.tags[0].name).toBe("Office");
  });

  it("drops a deleted tag id from local items", async () => {
    mocked.items.mockResolvedValue({
      items: [makeApiItem({ id: "i1", name: "GitHub", tagIds: ["t1", "t2"] })],
      nextCursor: null,
    });
    mocked.tags.mockResolvedValue({
      tags: [
        {
          id: "t1",
          nameEnc: sealString(VAULT_KEY, "Work", TAG_AAD),
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: "t2",
          nameEnc: sealString(VAULT_KEY, "Home", TAG_AAD),
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    await mount();
    expect(latest.items[0].tagIds).toEqual(["t1", "t2"]);

    mocked.deleteTag.mockResolvedValue({ ok: true });
    await act(async () => {
      await latest.deleteTag("t1");
    });

    expect(mocked.deleteTag).toHaveBeenCalledWith("t1");
    expect(latest.tags.map((tag) => tag.id)).toEqual(["t2"]);
    expect(latest.items[0].tagIds).toEqual(["t2"]);
  });
});

describe("bulk actions", () => {
  it("applies bulk trashed rows to state without reloading", async () => {
    mocked.items.mockResolvedValue({
      items: [
        makeApiItem({ id: "a", name: "A" }),
        makeApiItem({ id: "b", name: "B" }),
      ],
      nextCursor: null,
    });
    await mount();
    expect(latest.items).toHaveLength(2);
    const loadsAfterMount = mocked.items.mock.calls.length;

    mocked.bulkUpdateItems.mockResolvedValue({
      items: [makeApiItem({ id: "a", name: "A", deletedAt: NOW })],
    });

    await act(async () => {
      await latest.bulkTrash(["a"]);
    });

    expect(mocked.bulkUpdateItems).toHaveBeenCalledWith({
      action: "trash",
      ids: ["a"],
    });
    expect(latest.items.map((item) => item.id)).toEqual(["b"]);
    expect(latest.trashed.map((item) => item.id)).toEqual(["a"]);
    // A full refetch per bulk action is exactly what this path avoids.
    expect(mocked.items.mock.calls.length).toBe(loadsAfterMount);
  });

  it("applies bulk favorite and move rows in place", async () => {
    mocked.items.mockResolvedValue({
      items: [makeApiItem({ id: "a", name: "A" })],
      nextCursor: null,
    });
    await mount();

    mocked.bulkUpdateItems.mockResolvedValueOnce({
      items: [makeApiItem({ id: "a", name: "A", favorite: true })],
    });
    await act(async () => {
      await latest.bulkFavorite(["a"], true);
    });
    expect(mocked.bulkUpdateItems).toHaveBeenLastCalledWith({
      action: "favorite",
      ids: ["a"],
      favorite: true,
    });
    expect(latest.items[0].favorite).toBe(true);

    mocked.bulkUpdateItems.mockResolvedValueOnce({
      items: [makeApiItem({ id: "a", name: "A", folderId: "f2" })],
    });
    await act(async () => {
      await latest.bulkMove(["a"], "f2");
    });
    expect(mocked.bulkUpdateItems).toHaveBeenLastCalledWith({
      action: "move",
      ids: ["a"],
      folderId: "f2",
    });
    expect(latest.items[0].folderId).toBe("f2");
  });

  it("removes bulk destroyed rows from both lists", async () => {
    mocked.items.mockResolvedValue({
      items: [makeApiItem({ id: "a", name: "A" })],
      nextCursor: null,
    });
    await mount();
    // Put a second row in the trash so destroy has something to remove there.
    mocked.bulkUpdateItems.mockResolvedValueOnce({
      items: [makeApiItem({ id: "c", name: "C", deletedAt: NOW })],
    });
    await act(async () => {
      await latest.bulkTrash(["c"]);
    });
    expect(latest.trashed.map((item) => item.id)).toEqual(["c"]);

    mocked.bulkUpdateItems.mockResolvedValueOnce({
      items: [
        makeApiItem({ id: "a", name: "A" }),
        makeApiItem({ id: "c", name: "C" }),
      ],
    });
    await act(async () => {
      await latest.bulkDestroy(["a", "c"]);
    });

    expect(mocked.bulkUpdateItems).toHaveBeenLastCalledWith({
      action: "destroy",
      ids: ["a", "c"],
    });
    expect(latest.items).toHaveLength(0);
    expect(latest.trashed).toHaveLength(0);
  });
});
