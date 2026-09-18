import { describe, expect, it } from "vitest";
import { buildEncryptedExport, readEncryptedExport } from "./transfer";
import type { DecryptedItem, LoginPayload } from "./types";

const PASSPHRASE = "a long enough export passphrase";

function loginItem(): DecryptedItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "login",
    name: "GitHub",
    notes: "work account",
    data: { username: "octocat", password: "hunter2" },
    folderId: null,
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
