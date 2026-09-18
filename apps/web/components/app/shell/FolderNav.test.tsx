// @vitest-environment jsdom
import { useState } from "react";
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
import { FolderNav } from "./FolderNav";

/**
 * The real provider needs a session, a vault key, and a network round trip. The
 * stub keeps the same shape and lets the test own the folder list, so the folder
 * UI can be exercised on its own.
 */
vi.mock("@/lib/client/vault", async () => {
  const { createContext, useContext } = await import("react");
  const VaultContext = createContext<unknown>(null);
  return {
    VaultContext,
    useVault: () => useContext(VaultContext),
  };
});

interface VaultStub {
  loading: boolean;
  items: Array<{ folderId: string | null }>;
  folders: DecryptedFolder[];
  createFolder: (name: string) => Promise<DecryptedFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

const VaultContext = (
  vaultModule as unknown as {
    VaultContext: import("react").Context<VaultStub | null>;
  }
).VaultContext;

/**
 * jsdom does not implement the native <dialog> modal methods the Dialog
 * primitive relies on. The smallest stand-in is enough here: it just toggles
 * the `open` attribute so the dialog content is queryable.
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

function makeFolder(id: string, name: string): DecryptedFolder {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function Harness({
  initial = [],
  items = [],
}: {
  initial?: DecryptedFolder[];
  items?: Array<{ folderId: string | null }>;
}) {
  const [folders, setFolders] = useState<DecryptedFolder[]>(initial);

  const value: VaultStub = {
    loading: false,
    items,
    folders,
    createFolder: async (name) => {
      const created = makeFolder(`new-${folders.length + 1}`, name);
      setFolders((current) => [...current, created]);
      return created;
    },
    renameFolder: async (id, name) => {
      setFolders((current) =>
        current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
      );
    },
    deleteFolder: async (id) => {
      setFolders((current) => current.filter((folder) => folder.id !== id));
    },
  };

  return (
    <VaultContext.Provider value={value}>
      <ToastProvider>
        <FolderNav />
      </ToastProvider>
    </VaultContext.Provider>
  );
}

describe("FolderNav folder management", () => {
  it("creates a folder and shows it in the list", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByLabelText(/Folder name/), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));

    expect(await screen.findByRole("link", { name: /Work/ })).toBeTruthy();
  });

  it("renames a folder and updates its label", async () => {
    render(<Harness initial={[makeFolder("f1", "Work")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Work" }));
    const input = screen.getByLabelText(/Folder name/) as HTMLInputElement;
    expect(input.value).toBe("Work");

    fireEvent.change(input, { target: { value: "Office" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("link", { name: /Office/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Work/ })).toBeNull();
  });

  it("deletes a folder after confirmation and removes it", async () => {
    render(
      <Harness initial={[makeFolder("f1", "Work")]} items={[{ folderId: "f1" }]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Work" }));
    expect(screen.getByText(/Deleting Work/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /Work/ })).toBeNull();
    });
  });
});
