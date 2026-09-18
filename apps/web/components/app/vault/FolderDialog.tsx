"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { TextInput } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";

export type FolderDialogMode = "create" | "rename";

/** A folder name is one encrypted string, so it does not need to be long. */
export const FOLDER_NAME_MAX = 100;

export interface FolderReference {
  id: string;
  name: string;
}

export interface FolderDialogProps {
  /** Create makes a new folder; rename changes the name of `folder`. */
  mode: FolderDialogMode;
  /** The folder being renamed. Required for "rename", ignored for "create". */
  folder?: FolderReference | null;
  onClose: () => void;
  /** The caller mounts this dialog only while it is needed, so it opens fresh. */
  open?: boolean;
}

/**
 * One dialog for both folder actions. Creating and renaming differ only in the
 * copy and the vault call, so a mode prop keeps them from drifting apart.
 */
export function FolderDialog({
  mode,
  folder = null,
  onClose,
  open = true,
}: FolderDialogProps) {
  const vault = useVault();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const renaming = mode === "rename";

  // Seeded once: the caller remounts the dialog per target instead of reusing it.
  const [name, setName] = useState(folder?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setFailure(null);

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      // A whitespace-only name would otherwise create a folder with no label.
      setNameError("Give this folder a name so you can recognise it later.");
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length > FOLDER_NAME_MAX) {
      setNameError(`Keep the name to ${FOLDER_NAME_MAX} characters or fewer.`);
      inputRef.current?.focus();
      return;
    }
    setNameError(null);

    setSaving(true);
    try {
      if (renaming) {
        if (!folder) throw new Error("There is no folder to rename.");
        await vault.renameFolder(folder.id, trimmed);
        toast.success("Folder renamed", trimmed);
      } else {
        await vault.createFolder(trimmed);
        toast.success("Folder created", trimmed);
      }
      onClose();
    } catch (caught) {
      setFailure(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={renaming ? "Rename folder" : "New folder"}
      description={
        renaming
          ? "The new name replaces the old one and reaches your other devices on the next sync."
          : "Folders group items into things like Work or Personal. You can file an item into one from its editor."
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {renaming ? "Save name" : "Create folder"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <TextInput
          ref={inputRef}
          label="Folder name"
          name="folder-name"
          required
          maxLength={FOLDER_NAME_MAX}
          autoComplete="off"
          spellCheck={false}
          value={name}
          disabled={saving}
          error={nameError}
          hint={renaming ? undefined : "You can rename or delete it later."}
          placeholder={renaming ? undefined : "Work"}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
        />
      </form>

      {failure ? (
        <div role="alert" className="mt-4">
          <Callout tone="danger" title="Folder was not saved">
            {failure}
          </Callout>
        </div>
      ) : null}
    </Dialog>
  );
}

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "The server did not answer. Check your connection, then try again.";
}
