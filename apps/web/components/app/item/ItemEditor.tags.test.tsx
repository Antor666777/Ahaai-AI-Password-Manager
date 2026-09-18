// @vitest-environment jsdom
import { useMemo, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vaultModule from "@/lib/client/vault";
import type { ItemDraft } from "@/lib/client/vault";
import { ToastProvider } from "@/lib/client/toast";
import type { DecryptedItem, DecryptedTag } from "@/lib/client/types";
import { ItemEditor } from "./ItemEditor";

/**
 * The real provider needs a session, a vault key, and a network round trip. The
 * stub keeps the same shape and lets the test own the tag list. Same pattern as
 * CommandPalette.test.tsx.
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

afterEach(cleanup);

const ISO = "2026-01-01T00:00:00.000Z";

function makeTag(id: string, name: string): DecryptedTag {
  return { id, name, createdAt: ISO, updatedAt: ISO };
}

function makeItem(overrides: Partial<DecryptedItem> = {}): DecryptedItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "login",
    name: "Router",
    notes: "",
    data: { username: "", password: "" },
    folderId: null,
    tagIds: [],
    favorite: false,
    reprompt: false,
    revision: 1,
    deletedAt: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

const work = makeTag("t-work", "Work");

function renderEditor(
  {
    item = null as DecryptedItem | null,
    tags = [work] as DecryptedTag[],
    createTagImpl,
  }: {
    item?: DecryptedItem | null;
    tags?: DecryptedTag[];
    createTagImpl?: (name: string) => Promise<DecryptedTag>;
  } = {},
) {
  const exposed = {
    createTag: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
  };

  /**
   * The real provider keeps `tags` in state and appends a created one, so the
   * chip for a brand-new tag only appears once that state updates. The harness
   * mirrors that with a local list.
   */
  function Harness() {
    const [tagList, setTagList] = useState<DecryptedTag[]>(tags);

    const createTag = useMemo(
      () =>
        vi.fn(async (name: string) => {
          if (createTagImpl) return createTagImpl(name);
          const created = makeTag(`new-${name}`, name);
          setTagList((current) => [...current, created]);
          return created;
        }),
      [],
    );
    const createItem = useMemo(
      () =>
        vi.fn(async (draft: ItemDraft) =>
          makeItem({ ...draft, id: "created", name: draft.name }),
        ),
      [],
    );
    const updateItem = useMemo(
      () =>
        vi.fn(async (_id: string, draft: ItemDraft) =>
          makeItem({ ...draft, name: draft.name }),
        ),
      [],
    );

    exposed.createTag = createTag;
    exposed.createItem = createItem;
    exposed.updateItem = updateItem;

    return (
      <VaultContext.Provider
        value={{
          folders: [],
          tags: tagList,
          createTag,
          createItem,
          updateItem,
          reload: vi.fn(),
        }}
      >
        <ToastProvider>
          <ItemEditor
            item={item}
            defaultFolderId={null}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </ToastProvider>
      </VaultContext.Provider>
    );
  }

  render(<Harness />);

  return exposed;
}

function tagInput(): HTMLInputElement {
  return screen.getByLabelText("Add a tag") as HTMLInputElement;
}

function typeTag(name: string) {
  fireEvent.change(tagInput(), { target: { value: name } });
  fireEvent.keyDown(tagInput(), { key: "Enter" });
}

describe("ItemEditor tags", () => {
  it("adds an existing tag by name without creating a new one", async () => {
    const { createTag, createItem } = renderEditor();

    // Matched case-insensitively, so "work" resolves to "Work".
    typeTag("work");

    expect(screen.getByRole("button", { name: "Remove tag Work" })).toBeTruthy();
    expect(createTag).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Router" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0].tagIds).toEqual([work.id]);
  });

  it("creates a tag when the typed name is unknown", async () => {
    const { createTag, createItem } = renderEditor();

    typeTag("Travel");

    await waitFor(() => expect(createTag).toHaveBeenCalledWith("Travel"));
    expect(
      await screen.findByRole("button", { name: "Remove tag Travel" }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Router" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0].tagIds).toEqual(["new-Travel"]);
  });

  it("never adds the same tag twice", () => {
    renderEditor();

    typeTag("Work");
    typeTag("work");

    expect(
      screen.getAllByRole("button", { name: "Remove tag Work" }),
    ).toHaveLength(1);
  });

  it("removes a tag and clears the item's tags when the last one goes", async () => {
    const { updateItem } = renderEditor({
      item: makeItem({ tagIds: [work.id] }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove tag Work" }));
    expect(
      screen.queryByRole("button", { name: "Remove tag Work" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][1].tagIds).toEqual([]);
  });

  it("omits tagIds entirely when the item has no tags", async () => {
    const { createItem } = renderEditor();

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Router" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect("tagIds" in createItem.mock.calls[0][0]).toBe(false);
  });

  it("keeps the typed name and reports a createTag failure", async () => {
    const failing = vi.fn(async () => {
      throw new Error("Network down");
    });
    renderEditor({ createTagImpl: failing });

    typeTag("Fresh");

    await waitFor(() => expect(failing).toHaveBeenCalledWith("Fresh"));
    // The name is not lost, so a retry does not have to be retyped.
    expect(tagInput().value).toBe("Fresh");
    expect(await screen.findByText("Tag was not created")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove tag Fresh" }),
    ).toBeNull();
  });
});
