// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vaultModule from "@/lib/client/vault";
import { ToastProvider } from "@/lib/client/toast";
import type { DecryptedItem, DecryptedTag } from "@/lib/client/types";
import VaultPage from "./page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: null as unknown as URLSearchParams,
  setSettings: vi.fn(),
}));

// The URL is the source of truth for every filter, so the router is stubbed and
// the test owns the query string. `replace` mirrors what the real router would
// leave in the address bar, which is enough for a filter pick to take effect.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (url: string) => {
      mocks.replace(url);
      const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      mocks.searchParams = new URLSearchParams(query);
    },
    push: vi.fn(),
  }),
  usePathname: () => "/vault",
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/client/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/session")>();
  return {
    ...actual,
    useSession: () => ({ settings: null, setSettings: mocks.setSettings }),
  };
});

/**
 * The real provider needs a session, a vault key, and a network round trip. The
 * stub keeps the same shape and lets the test own the lists and the spy methods.
 */
vi.mock("@/lib/client/vault", async () => {
  const { createContext, useContext } = await import("react");
  const VaultContext = createContext<unknown>(null);
  return {
    VaultContext,
    useVault: () => useContext(VaultContext),
  };
});

const VaultContext = (
  vaultModule as unknown as {
    VaultContext: import("react").Context<unknown>;
  }
).VaultContext;

/**
 * jsdom does not implement the native <dialog> modal methods the Dialog
 * primitive relies on. The smallest stand-in toggles the `open` attribute so
 * the dialog content is queryable. Same pattern as CommandPalette.test.tsx.
 */
if (
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal !== "function"
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

afterEach(() => {
  cleanup();
  mocks.replace.mockClear();
  mocks.setSettings.mockClear();
});

const NOW = "2026-01-01T00:00:00.000Z";

function makeItem(
  overrides: Partial<DecryptedItem> & { id: string; name: string },
): DecryptedItem {
  return {
    type: "login",
    notes: "",
    data: {},
    folderId: null,
    tagIds: [],
    favorite: false,
    reprompt: false,
    revision: 1,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeVault(
  items: DecryptedItem[],
  overrides: Partial<ReturnType<typeof baseVault>> = {},
) {
  return { ...baseVault(), items, ...overrides };
}

function baseVault() {
  return {
    loading: false,
    error: null as string | null,
    items: [] as DecryptedItem[],
    trashed: [] as DecryptedItem[],
    folders: [] as Array<{ id: string; name: string; createdAt: string; updatedAt: string }>,
    tags: [] as DecryptedTag[],
    search: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    setFavorite: vi.fn().mockResolvedValue(undefined),
    trashItem: vi.fn().mockResolvedValue(undefined),
    restoreItem: vi.fn().mockResolvedValue(undefined),
    purgeItem: vi.fn().mockResolvedValue(undefined),
    bulkTrash: vi.fn().mockResolvedValue(undefined),
    bulkRestore: vi.fn().mockResolvedValue(undefined),
    bulkFavorite: vi.fn().mockResolvedValue(undefined),
    bulkMove: vi.fn().mockResolvedValue(undefined),
    bulkDestroy: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
  };
}

function Harness({ vault }: { vault: ReturnType<typeof baseVault> }) {
  return (
    <VaultContext.Provider value={vault}>
      <ToastProvider>
        <VaultPage />
      </ToastProvider>
    </VaultContext.Provider>
  );
}

function renderPage(
  vault: ReturnType<typeof baseVault>,
  params = new URLSearchParams(),
) {
  mocks.searchParams = params;
  const view = render(<Harness vault={vault} />);
  return {
    view,
    /** Swap the query string, as navigating or a filter pick would. */
    setParams(next: URLSearchParams) {
      mocks.searchParams = next;
      view.rerender(<Harness vault={vault} />);
    },
  };
}

function rowCheckbox(name: string): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: `Select ${name}`,
  }) as HTMLInputElement;
}

/** The rendered order of the vault rows, read top to bottom. */
function rowNames(): string[] {
  const list = screen.getByRole("list", { name: "Vault items" });
  return Array.from(list.querySelectorAll("li")).map(
    (row) => row.querySelector("span[title]")?.textContent ?? "",
  );
}

describe("vault bulk selection", () => {
  it("selects every visible row and reads as mixed once one is cleared", () => {
    renderPage(
      makeVault([
        makeItem({ id: "a", name: "Alpha" }),
        makeItem({ id: "b", name: "Beta" }),
        makeItem({ id: "c", name: "Gamma" }),
      ]),
    );

    const selectAll = screen.getByRole("checkbox", {
      name: "Select all",
    }) as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(false);

    fireEvent.click(selectAll);
    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);
    expect(rowCheckbox("Alpha").checked).toBe(true);
    expect(rowCheckbox("Beta").checked).toBe(true);
    expect(rowCheckbox("Gamma").checked).toBe(true);

    // One row off the summary box turns it mixed rather than checked.
    fireEvent.click(rowCheckbox("Beta"));
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);
    expect(rowCheckbox("Beta").checked).toBe(false);
  });

  it("prunes the selection when a filter hides some of it", async () => {
    const vault = makeVault([
      makeItem({ id: "a", name: "Alpha", type: "login" }),
      makeItem({ id: "b", name: "Beta", type: "login" }),
      makeItem({ id: "c", name: "Gamma", type: "card" }),
    ]);
    const { setParams } = renderPage(vault);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("3 items selected")).toBeTruthy();

    setParams(new URLSearchParams("type=login"));

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "Select Gamma" })).toBeNull();
    });
    expect(screen.getByText("2 items selected")).toBeTruthy();

    // The action can only ever reach what is still listed.
    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
    await waitFor(() => {
      expect(vault.bulkFavorite).toHaveBeenCalledWith(["a", "b"], true);
    });
  });

  it("calls the provider with exactly the selected ids and clears the selection", async () => {
    const vault = makeVault([
      makeItem({ id: "a", name: "Alpha" }),
      makeItem({ id: "b", name: "Beta" }),
    ]);
    renderPage(vault);

    fireEvent.click(rowCheckbox("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() => {
      expect(vault.bulkFavorite).toHaveBeenCalledWith(["a"], true);
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
    });
    expect(rowCheckbox("Alpha").checked).toBe(false);
  });

  it("requires confirmation before moving rows to the trash", async () => {
    const vault = makeVault([
      makeItem({ id: "a", name: "Alpha" }),
      makeItem({ id: "b", name: "Beta" }),
    ]);
    renderPage(vault);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));

    expect(vault.bulkTrash).not.toHaveBeenCalled();
    // The confirm button names the consequence and the count.
    expect(screen.getByText("Move 2 items to trash?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move 2 items to trash" }));

    await waitFor(() => {
      expect(vault.bulkTrash).toHaveBeenCalledWith(["a", "b"]);
    });
  });
});

describe("vault list is never the trash", () => {
  it("stays a vault list even when the URL still carries view=trash", () => {
    const vault = makeVault([makeItem({ id: "a", name: "Alpha" })], {
      trashed: [makeItem({ id: "t1", name: "Old note", deletedAt: NOW })],
    });

    renderPage(vault, new URLSearchParams("view=trash"));

    // The trash is its own route, so /vault shows the vault and ignores the
    // stale param rather than switching to a second trash surface.
    expect(screen.getByRole("heading", { name: "Vault" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Select Old note" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Trash" })).toBeNull();
  });
});

describe("vault list sort", () => {
  const items = [
    makeItem({
      id: "a",
      name: "Alpha",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    makeItem({
      id: "b",
      name: "Beta",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    }),
    makeItem({
      id: "c",
      name: "Gamma",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }),
  ];

  it("orders by name when no sort is chosen", () => {
    renderPage(makeVault(items));
    expect(rowNames()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("orders by most recently updated", () => {
    renderPage(makeVault(items), new URLSearchParams("sort=updated"));
    expect(rowNames()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("orders by most recently created", () => {
    renderPage(makeVault(items), new URLSearchParams("sort=created"));
    expect(rowNames()).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("falls back to name order when two rows share a timestamp", () => {
    const tied = [
      makeItem({ id: "a", name: "Alpha", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "b", name: "Beta", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeItem({ id: "c", name: "Gamma", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    renderPage(makeVault(tied), new URLSearchParams("sort=updated"));
    expect(rowNames()).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("writes the chosen sort to the URL and clears it for the default", () => {
    const { setParams } = renderPage(makeVault(items));

    fireEvent.change(screen.getByLabelText("Sort"), {
      target: { value: "updated" },
    });
    expect(mocks.replace).toHaveBeenLastCalledWith("/vault?sort=updated");

    setParams(new URLSearchParams("sort=updated"));
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "" } });
    expect(mocks.replace).toHaveBeenLastCalledWith("/vault");
  });
});
