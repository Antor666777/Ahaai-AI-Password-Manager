"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";

export type BulkActionMode = "vault" | "trash";

export interface BulkActionBarProps {
  /** The ids to act on. The bar only mounts when this is non-empty. */
  ids: string[];
  mode: BulkActionMode;
  /** Called once a bulk action lands, so the page can drop its selection. */
  onClear: () => void;
}

/** Which irreversible step is waiting on confirmation, if any. */
type ConfirmStep = "trash" | "destroy" | null;

/**
 * The bar sits in a fixed strip along the bottom, the same placement the vault
 * uses for its small-screen action bar, so it stays reachable on a phone rather
 * than needing room beside the list. Destructive steps pass through the shared
 * ConfirmDialog, whose button names the consequence and the count.
 */
export function BulkActionBar({ ids, mode, onClear }: BulkActionBarProps) {
  const {
    folders,
    bulkTrash,
    bulkRestore,
    bulkFavorite,
    bulkMove,
    bulkDestroy,
  } = useVault();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmStep>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveFolder, setMoveFolder] = useState("");

  const count = ids.length;
  const noun = count === 1 ? "item" : "items";
  const moveFolderName =
    folders.find((folder) => folder.id === moveFolder)?.name ?? "No folder";

  function messageOf(caught: unknown): string {
    if (caught instanceof Error && caught.message.length > 0) return caught.message;
    return "The server did not answer. Check your connection, then try again.";
  }

  /** Runs one bulk action, reports it, then drops the selection on success. */
  async function run(
    action: () => Promise<void>,
    title: string,
    description?: string,
  ) {
    setBusy(true);
    try {
      await action();
      toast.success(title, description);
      setConfirm(null);
      setMoveOpen(false);
      onClear();
    } catch (caught) {
      // A failed action keeps the selection, so the same choice can be retried.
      toast.error("The change was not saved", messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface p-3 shadow-[var(--shadow-2)]"
    >
      <div className="mx-auto flex w-full max-w-[84rem] flex-wrap items-center gap-x-3 gap-y-2 px-1 sm:px-2 lg:px-4">
        <p role="status" className="text-[13px] font-medium text-ink">
          {count} {noun} selected
        </p>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {mode === "vault" ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => bulkFavorite(ids, true),
                    count === 1 ? "Item added to favorites" : "Items added to favorites",
                  )
                }
              >
                Favorite
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => bulkFavorite(ids, false),
                    count === 1
                      ? "Item removed from favorites"
                      : "Items removed from favorites",
                  )
                }
              >
                Unfavorite
              </Button>
              <Button size="sm" disabled={busy} onClick={() => setMoveOpen(true)}>
                Move to folder
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => setConfirm("trash")}
              >
                Trash
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => bulkRestore(ids),
                    count === 1 ? "Item restored" : "Items restored",
                    count === 1
                      ? "It is back in your vault."
                      : "They are back in your vault.",
                  )
                }
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => setConfirm("destroy")}
              >
                Delete permanently
              </Button>
            </>
          )}

          <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      {confirm === "trash" ? (
        <ConfirmDialog
          open
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
          onConfirm={() =>
            void run(
              () => bulkTrash(ids),
              count === 1 ? "Item moved to trash" : "Items moved to trash",
              "Restore them from the trash if you change your mind.",
            )
          }
          title={`Move ${count} ${noun} to trash?`}
          description={`The ${count} ${noun} leave the vault and wait in the trash. Restore puts them back; delete removes them for good.`}
          confirmLabel={`Move ${count} ${noun} to trash`}
          loading={busy}
        />
      ) : null}

      {confirm === "destroy" ? (
        <ConfirmDialog
          open
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
          onConfirm={() =>
            void run(
              () => bulkDestroy(ids),
              count === 1
                ? "Item deleted permanently"
                : "Items deleted permanently",
              "Nothing can bring them back.",
            )
          }
          title={`Delete ${count} ${noun} permanently?`}
          description={`This erases ${count} ${noun} from the server for good. Nothing can bring them back, and other devices only match it after a full resync.`}
          confirmLabel={`Delete ${count} ${noun} permanently`}
          loading={busy}
        />
      ) : null}

      {moveOpen ? (
        <Dialog
          open
          onClose={() => {
            if (!busy) setMoveOpen(false);
          }}
          title={`Move ${count} ${noun}`}
          description={`Choose the folder the selected ${noun} belong in.`}
          footer={
            <>
              <Button onClick={() => setMoveOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() =>
                  void run(
                    () => bulkMove(ids, moveFolder === "" ? null : moveFolder),
                    count === 1 ? "Item moved" : "Items moved",
                    `Moved to ${moveFolderName}.`,
                  )
                }
              >
                Move {count} {noun}
              </Button>
            </>
          }
        >
          <SelectField
            label="Folder"
            value={moveFolder}
            onChange={(event) => setMoveFolder(event.target.value)}
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </SelectField>
        </Dialog>
      ) : null}
    </div>
  );
}
