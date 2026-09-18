// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vaultModule from "@/lib/client/vault";
import { ToastProvider } from "@/lib/client/toast";
import type { DecryptedItem, DecryptedTag } from "@/lib/client/types";
import { ItemInspector } from "./ItemInspector";

/**
 * The inspector renders HistoryDialog, which reaches for the vault. The stub
 * keeps the same shape without a key or a network round trip.
 */
vi.mock("@/lib/client/vault", async () => {
  const { createContext, useContext } = await import("react");
  const VaultContext = createContext<unknown>(null);
  return {
    VaultContext,
    useVault: () => useContext(VaultContext),
  };
});

const session = vi.hoisted(() => ({
  access: false,
  verify: vi.fn(async () => true),
}));

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({
    hasRepromptAccess: () => session.access,
    verifyMasterPassword: session.verify,
  }),
}));

const VaultContext = (
  vaultModule as unknown as {
    VaultContext: import("react").Context<unknown>;
  }
).VaultContext;

/** jsdom does not implement the native <dialog> modal methods. */
if (
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal !== "function"
) {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

afterEach(() => {
  cleanup();
  session.access = false;
});

const login: DecryptedItem = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "login",
  name: "Acme",
  notes: "",
  data: {
    username: "octocat",
    password: "hunter2",
    urls: ["https://acme.test"],
  },
  folderId: null,
  tagIds: [],
  favorite: false,
  reprompt: true,
  revision: 1,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderInspector(
  item: DecryptedItem = login,
  tags: DecryptedTag[] = [],
) {
  render(
    <VaultContext.Provider value={{ openRevision: () => item, tags }}>
      <ToastProvider>
        <ItemInspector
          item={item}
          folderName={null}
          favoriteBusy={false}
          onEdit={() => {}}
          onToggleFavorite={() => {}}
          onTrash={() => {}}
          onBack={() => {}}
        />
      </ToastProvider>
    </VaultContext.Provider>,
  );
}

describe("ItemInspector reprompt", () => {
  it("marks a reprompt item with a visible badge", () => {
    renderInspector();
    expect(screen.getByText("Master password required")).toBeTruthy();
  });

  it("gates the password but leaves the username readable", () => {
    session.access = false;
    renderInspector();

    expect(screen.getByText("octocat")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Master password")).toBeTruthy();
    expect(screen.queryByText("hunter2")).toBeNull();
  });

  it("reveals the password when the session already has access", () => {
    session.access = true;
    renderInspector();

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByText("hunter2")).toBeTruthy();
    expect(screen.queryByLabelText("Master password")).toBeNull();
  });
});

describe("ItemInspector tags", () => {
  const work: DecryptedTag = {
    id: "t-work",
    name: "Work",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("renders a chip per resolved tag as read-only metadata", () => {
    renderInspector({ ...login, tagIds: [work.id] }, [work]);

    expect(screen.getByText("Work")).toBeTruthy();
    // Presentation only: the chip is not a control.
    expect(screen.queryByRole("button", { name: "Work" })).toBeNull();
  });

  it("skips an id with no matching tag instead of a blank chip", () => {
    renderInspector({ ...login, tagIds: [work.id, "stale-id"] }, [work]);

    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.queryByText("stale-id")).toBeNull();
    expect(screen.queryByText("Untitled tag")).toBeNull();
  });
});
