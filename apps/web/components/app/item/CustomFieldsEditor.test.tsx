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
import type { ItemDraft } from "@/lib/client/vault";
import { ToastProvider } from "@/lib/client/toast";
import type {
  CustomField,
  DecryptedItem,
  LoginPayload,
} from "@/lib/client/types";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import { ItemEditor } from "./ItemEditor";

/**
 * The real provider needs a session, a vault key, and a network round trip. The
 * stub keeps the same shape so the editor can be exercised on its own. Same
 * pattern as CommandPalette.test.tsx.
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
 * the dialog content is queryable.
 */
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

function Harness({ initial = [] as CustomField[] }) {
  const [fields, setFields] = useState<CustomField[]>(initial);
  return <CustomFieldsEditor fields={fields} onChange={setFields} />;
}

describe("CustomFieldsEditor", () => {
  it("adds a labelled row and edits its name and value", () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Field name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));

    const name = screen.getByLabelText("Field name") as HTMLInputElement;
    const value = screen.getByLabelText("Field value") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "PIN" } });
    fireEvent.change(value, { target: { value: "4821" } });

    expect(name.value).toBe("PIN");
    expect(value.value).toBe("4821");
    // The icon-only remove button names the field it removes.
    expect(screen.getByRole("button", { name: "Remove PIN" })).toBeTruthy();
  });

  it("swaps the value control for a password field when the row is secret", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    fireEvent.change(screen.getByLabelText("Field value"), {
      target: { value: "4821" },
    });
    expect((screen.getByLabelText("Field value") as HTMLInputElement).type).toBe(
      "text",
    );

    fireEvent.click(screen.getByRole("switch", { name: "Keep this value secret" }));

    const value = screen.getByLabelText("Field value") as HTMLInputElement;
    expect(value.type).toBe("password");
    expect(value.value).toBe("4821");
  });

  it("removes the row it names and keeps the rest in order", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));

    const labels = screen.getAllByLabelText("Field name");
    fireEvent.change(labels[0], { target: { value: "First" } });
    fireEvent.change(labels[1], { target: { value: "Second" } });

    fireEvent.click(screen.getByRole("button", { name: "Remove First" }));

    const remaining = screen.getAllByLabelText("Field name") as HTMLInputElement[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].value).toBe("Second");
  });

  it("drops an empty-label row and carries reprompt into the saved draft", async () => {
    const saved: DecryptedItem = {
      id: "11111111-1111-4111-8111-111111111111",
      type: "login",
      name: "Router",
      notes: "",
      data: { username: "", password: "" },
      folderId: null,
      tagIds: [],
      favorite: false,
      reprompt: true,
      revision: 1,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const createItem = vi.fn(async (draft: ItemDraft) => ({
      ...saved,
      name: draft.name,
    }));

    render(
      <VaultContext.Provider
        value={{
          folders: [],
          tags: [],
          createTag: vi.fn(),
          createItem,
          updateItem: vi.fn(),
          reload: vi.fn(),
        }}
      >
        <ToastProvider>
          <ItemEditor
            item={null}
            defaultFolderId={null}
            onClose={() => {}}
            onSaved={() => {}}
          />
        </ToastProvider>
      </VaultContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Router" },
    });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Require the master password to reveal secrets",
      }),
    );

    // Two rows: one named, one abandoned with only a value.
    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    const names = screen.getAllByLabelText("Field name");
    const values = screen.getAllByLabelText("Field value");
    fireEvent.change(names[0], { target: { value: "PIN" } });
    fireEvent.change(values[0], { target: { value: "4821" } });
    fireEvent.change(values[1], { target: { value: "orphan" } });

    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    const draft = createItem.mock.calls[0][0];

    expect(draft.reprompt).toBe(true);

    const custom = (draft.data as LoginPayload).custom;
    expect(custom).toEqual([{ label: "PIN", value: "4821" }]);
  });
});
