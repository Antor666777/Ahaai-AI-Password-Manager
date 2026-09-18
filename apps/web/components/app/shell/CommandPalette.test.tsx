// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vaultModule from "@/lib/client/vault";
import type { DecryptedItem } from "@/lib/client/types";
import { CommandPalette } from "./CommandPalette";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  lock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

// The palette only needs the lock action from the session.
vi.mock("@/lib/client/session", () => ({
  useSession: () => ({ lock: mocks.lock }),
}));

/**
 * The real provider needs a session, a vault key, and a network round trip. The
 * stub keeps the same shape and lets the test own the item list.
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
    VaultContext: import("react").Context<{ items: DecryptedItem[] } | null>;
  }
).VaultContext;

/**
 * jsdom does not implement the native <dialog> modal methods the Dialog
 * primitive relies on. The smallest stand-in is enough here: it just toggles
 * the `open` attribute so the dialog content is queryable. Same pattern as
 * FolderNav.test.tsx.
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
  mocks.push.mockClear();
  mocks.replace.mockClear();
  mocks.lock.mockClear();
});

const github: DecryptedItem = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "login",
  name: "GitHub",
  notes: "work",
  data: { username: "octocat", password: "hunter2" },
  folderId: null,
  tagIds: [],
  favorite: false,
  reprompt: false,
  revision: 1,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderPalette(items: DecryptedItem[] = [github]) {
  const onClose = vi.fn();
  render(
    <VaultContext.Provider value={{ items }}>
      <CommandPalette onClose={onClose} />
    </VaultContext.Provider>,
  );
  return { onClose };
}

describe("CommandPalette", () => {
  it("filters to an item and opens it on Enter", async () => {
    const { onClose } = renderPalette();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "git" } });
    await screen.findByRole("option", { name: /GitHub/ });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(mocks.push).toHaveBeenCalledWith(`/vault?item=${github.id}`);
    expect(onClose).toHaveBeenCalled();
  });

  it("matches a login by its username as well as its name", async () => {
    renderPalette();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "octocat" } });

    expect(await screen.findByRole("option", { name: /GitHub/ })).toBeTruthy();
  });

  it("runs an action when it is the active option", async () => {
    renderPalette();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "lock" } });
    await screen.findByRole("option", { name: /Lock vault/ });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/unlock");
  });

  it("offers the actions and destinations while the query is empty", () => {
    renderPalette();

    expect(screen.getByRole("option", { name: /New item/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Lock vault/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Health/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Settings/ })).toBeTruthy();
    // Items stay out of the way until a query narrows them.
    expect(screen.queryByRole("option", { name: /GitHub/ })).toBeNull();
  });

  it("announces when a query matches nothing", async () => {
    renderPalette();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "zzzznope" } });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("No matches");
    expect(screen.queryByRole("option")).toBeNull();
  });
});
