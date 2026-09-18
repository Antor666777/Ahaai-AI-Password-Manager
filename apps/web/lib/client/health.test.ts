import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha1HexUpper } from "@ahaai/core/hibp/hash";
import { api } from "./api";
import { analyzeVault, MAX_PREFIXES_PER_REQUEST, resetHealthCache } from "./health";
import type { DecryptedItem } from "./types";

// The sweep only ever talks to the batch range endpoint, so the whole api
// surface is replaced with the one call the analysis makes.
vi.mock("./api", () => ({
  api: { pwnedRanges: vi.fn() },
}));

const pwnedRanges = vi.mocked(api.pwnedRanges);

const NOW = Date.parse("2026-06-15T00:00:00.000Z");
const DAY = 86_400_000;

/**
 * Builds the range response the API would return for a set of breached
 * passwords, using the same SHA-1 the engine computes so the suffix lines line
 * up. Passwords not listed come back with no suffix at all (not breached).
 */
function stubBreaches(breached: Record<string, number>): void {
  const suffixesByPrefix = new Map<string, string>();
  for (const [password, count] of Object.entries(breached)) {
    const hash = sha1HexUpper(password);
    suffixesByPrefix.set(hash.slice(0, 5), `${hash.slice(5)}:${count}`);
  }

  pwnedRanges.mockImplementation(async (prefixes: string[]) => ({
    ranges: prefixes.map((prefix) => {
      const normalized = prefix.toUpperCase();
      return {
        prefix: normalized,
        suffixes: suffixesByPrefix.get(normalized) ?? "",
        cached: false,
      };
    }),
  }));
}

function loginItem(
  id: string,
  password: string,
  overrides: Partial<DecryptedItem> = {},
): DecryptedItem {
  return {
    id,
    type: "login",
    name: id,
    notes: "",
    data: { password },
    folderId: null,
    favorite: false,
    reprompt: false,
    revision: 1,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date(NOW - 10 * DAY).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  resetHealthCache();
  pwnedRanges.mockReset();
});

describe("analyzeVault classification", () => {
  it("flags a password that appears in a breach", async () => {
    const password = "hunter2-hunter2-hunter2";
    stubBreaches({ [password]: 42 });

    const result = await analyzeVault([loginItem("a", password)], { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].statuses).toContain("breached");
    expect(result.entries[0].breachCount).toBe(42);
    expect(result.entries[0].statuses).not.toContain("weak");
    expect(result.summary.breached).toBe(1);
  });

  it("flags a password shared by more than one login as reused", async () => {
    const password = "Shared-Password-123";
    stubBreaches({});
    const items = [loginItem("a", password), loginItem("b", password)];

    const result = await analyzeVault(items, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.every((entry) => entry.statuses.includes("reused"))).toBe(
      true,
    );
    expect(result.entries[0].reuseCount).toBe(2);
    expect(result.summary.reused).toBe(2);
  });

  it("flags a short or single-class password as weak", async () => {
    stubBreaches({});
    const items = [
      loginItem("short", "Ab1!x"),
      loginItem("single-class", "thisisalllowercase"),
    ];

    const result = await analyzeVault(items, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.every((entry) => entry.statuses.includes("weak"))).toBe(
      true,
    );
    expect(result.summary.weak).toBe(2);
  });

  it("flags an old, unchanged password as stale", async () => {
    stubBreaches({});
    const items = [
      loginItem("old", "Unique-Stale-Pass1", {
        updatedAt: new Date(NOW - 200 * DAY).toISOString(),
      }),
    ];

    const result = await analyzeVault(items, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].statuses).toEqual(["stale"]);
    expect(result.entries[0].ageDays).toBe(200);
    expect(result.summary.stale).toBe(1);
  });

  it("reports a unique, strong, recent, unbreached password as healthy", async () => {
    stubBreaches({});

    const result = await analyzeVault([loginItem("good", "Kx7#mQ2vLp9wZ!")], {
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].statuses).toEqual([]);
    expect(result.summary.healthy).toBe(1);
    expect(result.summary.score).toBe(100);
  });

  it("records every status an item trips at once", async () => {
    const password = "StaleReused1!aa";
    stubBreaches({ [password]: 7 });
    const items = [
      loginItem("a", password, {
        updatedAt: new Date(NOW - 400 * DAY).toISOString(),
      }),
      loginItem("b", password, {
        updatedAt: new Date(NOW - 400 * DAY).toISOString(),
      }),
    ];

    const result = await analyzeVault(items, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].statuses.sort()).toEqual(
      ["breached", "reused", "stale"].sort(),
    );
    expect(result.summary.breached).toBe(2);
    expect(result.summary.reused).toBe(2);
    expect(result.summary.stale).toBe(2);
    expect(result.summary.healthy).toBe(0);
  });

  it("lowers the score when items are flagged", async () => {
    stubBreaches({});
    const items = [
      loginItem("good", "Kx7#mQ2vLp9wZ!"),
      loginItem("bad", "abcdefgh"), // short and one class
    ];

    const result = await analyzeVault(items, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.total).toBe(2);
    expect(result.summary.score).toBeLessThan(100);
    expect(result.summary.score).toBeGreaterThanOrEqual(0);
  });

  it("ignores non-login items and logins with no password", async () => {
    stubBreaches({});
    const note: DecryptedItem = {
      ...loginItem("note", ""),
      type: "secure_note",
      data: { body: "hello" },
    };
    const items = [note, loginItem("nopw", ""), loginItem("good", "Kx7#mQ2vLp9wZ!")];

    const result = await analyzeVault(items, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.total).toBe(1);
    expect(result.entries[0].item.id).toBe("good");
  });

  it("sends only 5-character SHA-1 prefixes to the API", async () => {
    stubBreaches({});

    await analyzeVault(
      [loginItem("a", "Kx7#mQ2vLp9wZ!"), loginItem("b", "Another-Good-Pass1")],
      { now: NOW },
    );

    expect(pwnedRanges).toHaveBeenCalled();
    for (const [prefixes] of pwnedRanges.mock.calls) {
      expect(prefixes.length).toBeGreaterThan(0);
      for (const prefix of prefixes) expect(prefix).toMatch(/^[0-9A-F]{5}$/);
    }
  });

  it("chunks the sweep into requests of at most the schema limit", async () => {
    stubBreaches({});
    const items = Array.from({ length: 260 }, (_, index) =>
      loginItem(`i${index}`, `Password-${index}-Aa1!`),
    );

    await analyzeVault(items, { now: NOW });

    const sizes = pwnedRanges.mock.calls.map(([prefixes]) => prefixes.length);
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_PREFIXES_PER_REQUEST);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    expect(total).toBeGreaterThan(MAX_PREFIXES_PER_REQUEST);
    expect(total).toBeLessThanOrEqual(items.length);
  });

  it("reuses cached ranges on a second run", async () => {
    stubBreaches({ "Kx7#mQ2vLp9wZ!": 1 });
    const items = [loginItem("a", "Kx7#mQ2vLp9wZ!")];

    await analyzeVault(items, { now: NOW });
    await analyzeVault(items, { now: NOW });

    expect(pwnedRanges).toHaveBeenCalledTimes(1);
  });

  it("returns an error result instead of throwing when the range call fails", async () => {
    pwnedRanges.mockRejectedValueOnce(new Error("offline"));

    const result = await analyzeVault([loginItem("a", "Kx7#mQ2vLp9wZ!")], {
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("offline");
  });

  it("scores an empty vault as perfect and empty", async () => {
    stubBreaches({});

    const result = await analyzeVault([], { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.total).toBe(0);
    expect(result.summary.score).toBe(100);
    expect(result.entries).toEqual([]);
    expect(pwnedRanges).not.toHaveBeenCalled();
  });
});
