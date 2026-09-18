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
import type { DecryptedFolder } from "@/lib/client/types";
import { BulkActionBar, type BulkActionMode } from "./BulkActionBar";

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

function makeVault(folders: DecryptedFolder[] = []) {
  return {
    folders,
    bulkTrash: vi.fn().mockResolvedValue(undefined),
    bulkRestore: vi.fn().mockResolvedValue(undefined),
    bulkFavorite: vi.fn().mockResolvedValue(undefined),
    bulkMove: vi.fn().mockResolvedValue(undefined),
    bulkDestroy: vi.fn().mockResolvedValue(undefined),
  };
}

function renderBar(
  vault: ReturnType<typeof makeVault>,
  props: { ids: string[]; mode: BulkActionMode },
) {
  const onClear = vi.fn();
  render(
    <VaultContext.Provider value={vault}>
      <ToastProvider>
        <BulkActionBar ids={props.ids} mode={props.mode} onClear={onClear} />
      </ToastProvider>
    </VaultContext.Provider>,
  );
  return { onClear };
}

describe("BulkActionBar", () => {
  it("reports the count and favorites exactly the selected ids", async () => {
    const vault = makeVault();
    const { onClear } = renderBar(vault, { ids: ["a", "b"], mode: "vault" });

    expect(screen.getByText("2 items selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() => {
      expect(vault.bulkFavorite).toHaveBeenCalledWith(["a", "b"], true);
    });
    await waitFor(() => {
      expect(onClear).toHaveBeenCalled();
    });
  });

  it("trashes only after the confirmation names the count", async () => {
    const vault = makeVault();
    renderBar(vault, { ids: ["a", "b"], mode: "vault" });

    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    expect(vault.bulkTrash).not.toHaveBeenCalled();
    expect(screen.getByText("Move 2 items to trash?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move 2 items to trash" }));
    await waitFor(() => {
      expect(vault.bulkTrash).toHaveBeenCalledWith(["a", "b"]);
    });
  });

  it("moves the selection to a chosen folder", async () => {
    const vault = makeVault([
      { id: "f1", name: "Work", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    renderBar(vault, { ids: ["a"], mode: "vault" });

    fireEvent.click(screen.getByRole("button", { name: "Move to folder" }));
    const select = screen.getByLabelText("Folder") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "f1" } });
    fireEvent.click(screen.getByRole("button", { name: "Move 1 item" }));

    await waitFor(() => {
      expect(vault.bulkMove).toHaveBeenCalledWith(["a"], "f1");
    });
  });

  it("swaps the vault actions for restore and permanent delete in the trash", async () => {
    const vault = makeVault();
    renderBar(vault, { ids: ["a"], mode: "trash" });

    expect(screen.queryByRole("button", { name: "Favorite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move to folder" })).toBeNull();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(vault.bulkDestroy).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing can bring them back/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete 1 item permanently" }));
    await waitFor(() => {
      expect(vault.bulkDestroy).toHaveBeenCalledWith(["a"]);
    });
  });

  it("restores the selection straight away", async () => {
    const vault = makeVault();
    renderBar(vault, { ids: ["a", "b"], mode: "trash" });

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(vault.bulkRestore).toHaveBeenCalledWith(["a", "b"]);
    });
  });
});
