import { describe, expect, it } from "vitest";
import { parseCsv } from "@ahaai/core/transfer";
import { buildCsvExport, buildEncryptedExport, readEncryptedExport } from "./transfer";
import type { DecryptedItem, DecryptedTag, LoginPayload } from "./types";

const PASSPHRASE = "a long enough export passphrase";

function loginItem(): DecryptedItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "login",
    name: "GitHub",
    notes: "work account",
    data: { username: "octocat", password: "hunter2" },
    folderId: null,
    tagIds: [],
    favorite: false,
    reprompt: false,
    revision: 1,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

/**
 * A backup that cannot be restored is worse than no backup, so the sealed
 * export must survive a full round trip. Argon2id is deliberately slow here,
 * hence the raised timeout.
 */
describe("encrypted export", () => {
  it("round-trips the vault through the passphrase-sealed envelope", async () => {
    const text = await buildEncryptedExport([loginItem()], [], PASSPHRASE);
    const payload = await readEncryptedExport(text, PASSPHRASE);

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].type).toBe("login");
    expect(payload.items[0].name).toBe("GitHub");

    const login = payload.items[0].payload as LoginPayload;
    expect(login.username).toBe("octocat");
    expect(login.password).toBe("hunter2");
  }, 30_000);

  it("refuses a wrong passphrase and a file that is not an Ahaai export", async () => {
    const text = await buildEncryptedExport([loginItem()], [], PASSPHRASE);

    await expect(readEncryptedExport(text, "wrong passphrase")).rejects.toThrow(
      /decrypt/i,
    );
    await expect(
      readEncryptedExport('{"format":"something-else"}', PASSPHRASE),
    ).rejects.toThrow(/Ahaai/i);
  }, 30_000);
});

describe("generic CSV export carries tags", () => {
  const TAGS: DecryptedTag[] = [
    {
      id: "t1",
      name: "Work",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "t2",
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("writes decrypted tag names and omits the cell for an untagged item", () => {
    const tagged: DecryptedItem = {
      ...loginItem(),
      id: "22222222-2222-4222-8222-222222222222",
      name: "GitHub",
      tagIds: ["t1", "t2"],
    };
    const untagged: DecryptedItem = {
      ...loginItem(),
      id: "33333333-3333-4333-8333-333333333333",
      name: "GitLab",
      tagIds: [],
    };

    const csv = buildCsvExport([tagged, untagged], [], "generic", TAGS);
    const table = parseCsv(csv);
    const header = table[0];
    const tagsIndex = header.indexOf("tags");
    const nameIndex = header.indexOf("name");
    expect(tagsIndex).toBeGreaterThanOrEqual(0);

    const rowFor = (name: string) =>
      table.find((row) => row[nameIndex] === name);
    const taggedCell = rowFor("GitHub")?.[tagsIndex];
    const untaggedCell = rowFor("GitLab")?.[tagsIndex];

    // The names, not the ids, travel in the column, newline-joined.
    expect(taggedCell).toBe("Work\nPersonal");
    expect(csv).toContain("Work");
    // An item with no tags leaves the cell empty rather than writing a stub.
    expect(untaggedCell).toBe("");
  });
});
