"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderDialog } from "@/components/app/vault/FolderDialog";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";
import type { DecryptedFolder } from "@/lib/client/types";
import { FolderIcon, PlusIcon } from "./Icons";

/** Which dialog, if any, is open over the folder list. */
type EditorState =
  | { kind: "create" }
  | { kind: "rename"; folder: DecryptedFolder }
  | null;

/**
 * Folders are a filter, not a page, so each one links to the vault with a
 * folder already applied. The name stays the only navigation target: rename and
 * delete are siblings of the link in the row, never click targets inside it, so
 * a keyboard or screen reader meets one link and then two named buttons. The
 * icon set has no rename glyph, so both actions are labelled text buttons.
 */
export function FolderNav({ onNavigate }: { onNavigate?: () => void }) {
  const { folders, items, loading, deleteFolder } = useVault();
  const toast = useToast();
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirming, setConfirming] = useState<DecryptedFolder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Counts come from the live items, so a folder's number matches the list its
  // link filters to. Trashed items are already excluded from `items`.
  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    for (const item of items) {
      if (item.folderId) {
        byFolder.set(item.folderId, (byFolder.get(item.folderId) ?? 0) + 1);
      }
    }
    return byFolder;
  }, [items]);

  async function confirmDelete() {
    const folder = confirming;
    if (!folder || deleting) return;
    setDeleting(true);
    try {
      await deleteFolder(folder.id);
      toast.success(
        "Folder deleted",
        `${folder.name} is gone. Its items are still in the vault, now unfiled.`,
      );
      setConfirming(null);
    } catch (caught) {
      toast.error("Could not delete the folder", messageOf(caught));
    } finally {
      setDeleting(false);
    }
  }

  const confirmingCount = confirming ? (counts.get(confirming.id) ?? 0) : 0;

  return (
    <section aria-labelledby="ahaai-folders-heading">
      <h2
        id="ahaai-folders-heading"
        className="px-3 text-[11px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Folders
      </h2>

      {folders.length === 0 ? (
        <p className="px-3 pt-2 text-[12.5px] leading-snug text-ink-faint">
          {loading
            ? "Loading folders"
            : "No folders yet. Folders group items into things like Work or Personal."}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {folders.map((folder) => {
            const count = counts.get(folder.id) ?? 0;
            const countLabel = `${count} ${count === 1 ? "item" : "items"}`;
            return (
              <li key={folder.id} className="flex items-center gap-0.5">
                <Link
                  href={`/vault?folder=${encodeURIComponent(folder.id)}`}
                  onClick={onNavigate}
                  title={folder.name}
                  className="flex h-11 min-w-0 flex-1 items-center gap-2.5 truncate rounded-md px-3 text-[13px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <FolderIcon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="shrink-0 text-[12px] text-ink-faint" title={countLabel}>
                    <span aria-hidden="true">{count}</span>
                    <span className="sr-only">{countLabel}</span>
                  </span>
                </Link>

                <button
                  type="button"
                  aria-label={`Rename ${folder.name}`}
                  onClick={() => setEditor({ kind: "rename", folder })}
                  className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[12.5px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  Rename
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${folder.name}`}
                  onClick={() => setConfirming(folder)}
                  className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[12.5px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-danger"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setEditor({ kind: "create" })}
        className="mt-1.5 flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-[13px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <PlusIcon className="size-4 shrink-0" />
        New folder
      </button>

      {editor ? (
        <FolderDialog
          // Remount per target so the name field is seeded exactly once.
          key={editor.kind === "rename" ? editor.folder.id : "create"}
          mode={editor.kind}
          folder={editor.kind === "rename" ? editor.folder : null}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => {
          if (!deleting) setConfirming(null);
        }}
        onConfirm={() => void confirmDelete()}
        title={confirming ? `Delete ${confirming.name}?` : "Delete this folder?"}
        description={
          confirming
            ? `Deleting ${confirming.name} cannot be undone. ${
                confirmingCount === 0
                  ? "It holds no items yet, so nothing else changes."
                  : confirmingCount === 1
                    ? "The one item in it stays in your vault and becomes unfiled."
                    : `The ${confirmingCount} items in it stay in your vault and become unfiled.`
              }`
            : ""
        }
        confirmLabel="Delete folder"
        loading={deleting}
      />
    </section>
  );
}

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "The server did not answer. Check your connection, then try again.";
}
