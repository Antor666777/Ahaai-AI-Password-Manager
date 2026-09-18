import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransferItemType, TransferRecord } from "@ahaai/core/transfer";
import type { DecryptedTag } from "./types";

// The import path only ever posts sealed batches, so that is the whole call
// surface the test needs to stand in for.
vi.mock("./api", () => ({
  api: { bulkCreateItem: vi.fn() },
}));

import { api } from "./api";
import { commitImport, type ImportPreflight } from "./transfer";

const mocked = vi.mocked(api);
const VAULT_KEY = new Uint8Array(32).fill(3);
const NOW = "2026-01-01T00:00:00.000Z";

function tag(id: string, name: string): DecryptedTag {
  return { id, name, createdAt: NOW, updatedAt: NOW };
}

/** Mirrors `preflightFromRecords`, keeping only what `commitImport` consumes. */
function makePreflight(records: TransferRecord[]): ImportPreflight {
  const byType: Record<TransferItemType, number> = {
    login: 0,
    card: 0,
    identity: 0,
    secure_note: 0,
  };
  for (const record of records) byType[record.type] += 1;

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const raw of record.tags ?? []) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (name.length === 0 || seen.has(key)) continue;
      seen.add(key);
      tags.push(name);
    }
  }

  return {
    fileName: "import.csv",
    format: "bitwarden",
    records,
    skipped: [],
    total: records.length,
    byType,
    folders: [],
    tags,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.bulkCreateItem.mockResolvedValue({ items: [] });
});

describe("commitImport", () => {
  it("carries reprompt and resolved tagIds into the sealed batch", async () => {
    const record: TransferRecord = {
      type: "login",
      name: "GitHub",
      payload: { password: "hunter2" },
      reprompt: true,
      tags: ["Work"],
    };

    const result = await commitImport(makePreflight([record]), {
      vaultKey: VAULT_KEY,
      folders: [],
      tags: [tag("t1", "Work")],
      createTag: vi.fn(),
    });

    const [batch] = mocked.bulkCreateItem.mock.calls[0];
    expect(batch[0].reprompt).toBe(true);
    expect(batch[0].tagIds).toEqual(["t1"]);
    expect(result.tagsCreated).toBe(0);
  });

  it("reuses existing tag names case-insensitively and creates each new one once", async () => {
    const createTag = vi.fn(async (name: string) => tag("t2", name));
    const records: TransferRecord[] = [
      {
        type: "login",
        name: "A",
        payload: { password: "a" },
        tags: ["Work", "new"],
      },
      {
        type: "login",
        name: "B",
        payload: { password: "b" },
        tags: ["work", "New"],
      },
    ];

    const result = await commitImport(makePreflight(records), {
      vaultKey: VAULT_KEY,
      folders: [],
      // "work" already exists; "Work" and "work" name the same tag.
      tags: [tag("t1", "work")],
      createTag,
    });

    expect(createTag).toHaveBeenCalledTimes(1);
    expect(createTag).toHaveBeenCalledWith("new");
    expect(result.tagsCreated).toBe(1);

    const [batch] = mocked.bulkCreateItem.mock.calls[0];
    expect(batch[0].tagIds).toEqual(["t1", "t2"]);
    expect(batch[1].tagIds).toEqual(["t1", "t2"]);
  });

  it("defaults reprompt to false and omits tagIds when there are no tags", async () => {
    const record: TransferRecord = {
      type: "secure_note",
      name: "Note",
      payload: { body: "hello" },
    };

    await commitImport(makePreflight([record]), {
      vaultKey: VAULT_KEY,
      folders: [],
    });

    const [batch] = mocked.bulkCreateItem.mock.calls[0];
    expect(batch[0].reprompt).toBe(false);
    expect("tagIds" in batch[0]).toBe(false);
  });

  it("drops a tag it cannot resolve rather than storing a dangling id", async () => {
    const record: TransferRecord = {
      type: "login",
      name: "A",
      payload: { password: "a" },
      tags: ["Unknown"],
    };

    await commitImport(makePreflight([record]), {
      vaultKey: VAULT_KEY,
      folders: [],
      tags: [],
    });

    const [batch] = mocked.bulkCreateItem.mock.calls[0];
    expect("tagIds" in batch[0]).toBe(false);
  });
});
