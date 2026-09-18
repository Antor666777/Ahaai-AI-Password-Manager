// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vaultModule from "@/lib/client/vault";
import { ToastProvider } from "@/lib/client/toast";
import type { DecryptedItem } from "@/lib/client/types";
import { TrashPanel } from "./TrashPanel";

/**
 * The real provider needs a session, a vault key, and a network round trip. The
 * stub keeps the same shape and lets the test own the spy methods.
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
 * primitive relies on. The smallest stand-in toggles the `open` attribute.
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

afterEach(cleanup);

const NOW = "2026-01-01T00:00:00.000Z";

function trashedItem(id: string, name: string): DecryptedItem {
  return {
    id,
    type: "login",
    name,
    notes: "",
    data: {},
    folderId: null,
    tagIds: [],
    favorite: false,
    reprompt: false,
    revision: 1,
    deletedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeVault(trashed: DecryptedItem[]) {
  return {
    trashed,
    loading: false,
    error: null as string | null,
    folders: [],
    restoreItem: vi.fn().mockResolvedValue(undefined),
    purgeItem: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    bulkTrash: vi.fn().mockResolvedValue(undefined),
    bulkRestore: vi.fn().mockResolvedValue(undefined),
    bulkFavorite: vi.fn().mockResolvedValue(undefined),
    bulkMove: vi.fn().mockResolvedValue(undefined),
    bulkDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPanel(vault: ReturnType<typeof makeVault>) {
  render(
    <VaultContext.Provider value={vault}>
      <ToastProvider>
        <TrashPanel />
      </ToastProvider>
    </VaultContext.Provider>,
  );
}

function rowCheckbox(name: string): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: `Select ${name}`,
  }) as HTMLInputElement;
}

describe("trash bulk selection", () => {
  it("lets select-all cover every trashed row and reveals the bulk actions", () => {
    renderPanel(
      makeVault([trashedItem("t1", "Old note"), trashedItem("t2", "Old card")]),
    );

    const selectAll = screen.getByRole("checkbox", {
      name: "Select all",
    }) as HTMLInputElement;
    expect(selectAll.checked).toBe(false);

    fireEvent.click(selectAll);
    expect(selectAll.checked).toBe(true);
    expect(rowCheckbox("Old note").checked).toBe(true);
    expect(rowCheckbox("Old card").checked).toBe(true);

    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 items selected")).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(
      within(bar).getByRole("button", { name: "Delete permanently" }),
    ).toBeTruthy();
  });

  it("restores every selected row", async () => {
    const vault = makeVault([
      trashedItem("t1", "Old note"),
      trashedItem("t2", "Old card"),
    ]);
    renderPanel(vault);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    fireEvent.click(within(bar).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(vault.bulkRestore).toHaveBeenCalledWith(["t1", "t2"]);
    });
  });

  it("permanently deletes only after the confirmation names the count", async () => {
    const vault = makeVault([
      trashedItem("t1", "Old note"),
      trashedItem("t2", "Old card"),
    ]);
    renderPanel(vault);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    fireEvent.click(within(bar).getByRole("button", { name: "Delete permanently" }));

    expect(vault.bulkDestroy).not.toHaveBeenCalled();
    // Permanent deletion names the count, and says it cannot be undone.
    expect(screen.getByText("Delete 2 items permanently?")).toBeTruthy();
    expect(screen.getByText(/Nothing can bring them back/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete 2 items permanently" }),
    );
    await waitFor(() => {
      expect(vault.bulkDestroy).toHaveBeenCalledWith(["t1", "t2"]);
    });
  });

  it("keeps the per-row restore and the named purge confirmation", async () => {
    const vault = makeVault([trashedItem("t1", "Old note")]);
    renderPanel(vault);

    // Per-row restore stays immediate.
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(vault.restoreItem).toHaveBeenCalledWith("t1");
    });

    // The per-row purge still passes through a confirmation that names the item.
    fireEvent.click(screen.getByRole("button", { name: "Purge permanently" }));
    expect(screen.getByText("Purge this item permanently?")).toBeTruthy();
    // The description names the item the purge would erase.
    expect(screen.getByText(/This erases Old note/)).toBeTruthy();
    expect(vault.purgeItem).not.toHaveBeenCalled();

    // The dialog's confirm button shares its label with the row button, so the
    // last one in the DOM (rendered by the dialog) is the one to press.
    const confirms = screen.getAllByRole("button", {
      name: "Purge permanently",
    });
    fireEvent.click(confirms[confirms.length - 1]);
    await waitFor(() => {
      expect(vault.purgeItem).toHaveBeenCalledWith("t1");
    });
  });
});
