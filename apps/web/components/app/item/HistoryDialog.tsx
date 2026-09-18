"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   History is fetched when the dialog opens. Every setState runs from the async
   loader, not from a synchronous cascading render, matching the rest of the
   client-side data loading in this app. */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Callout, Spinner } from "@/components/ui/feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";
import type { ApiRevision, DecryptedItem } from "@/lib/client/types";
import {
  absoluteStamp,
  relativeStamp,
  useNow,
} from "@/components/app/security/format";

export interface HistoryDialogProps {
  item: DecryptedItem;
  open: boolean;
  onClose: () => void;
}

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "The server did not answer. Check your connection, then try again.";
}

function displayName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "Untitled item";
}

/**
 * Read-only history of an item's encrypted snapshots. The list shows the live
 * version alongside the stored ones; restoring re-applies an old snapshot as a
 * normal update, so the displaced version is itself captured in history.
 */
export function HistoryDialog({ item, open, onClose }: HistoryDialogProps) {
  const vault = useVault();
  const toast = useToast();
  const now = useNow();

  const [revisions, setRevisions] = useState<ApiRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ApiRevision | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.itemRevisions(item.id);
      setRevisions(result.revisions);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function handleRestore() {
    if (!pending || restoring) return;
    const target = pending;
    setRestoring(true);
    try {
      await vault.restoreRevision(item.id, target);
      toast.success(
        "Version restored",
        "The version that was current is saved in history first, so you can put it back.",
      );
      setPending(null);
      await load();
    } catch (caught) {
      toast.error("Version was not restored", messageOf(caught));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Item history"
        description="Ahaai keeps the last twenty versions of this item on the server. Restoring one saves the current version to history first, so a restore is undoable."
        footer={<Button onClick={onClose}>Close</Button>}
      >
        {loading ? (
          <div role="status" className="flex items-center gap-2 py-2 text-[13px] text-ink-muted">
            <Spinner className="size-4" />
            Loading history
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <Callout tone="danger" title="History did not load">
              {error}
            </Callout>
            <Button size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto rounded-md border border-line">
            <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className="truncate text-[13.5px] font-medium text-ink"
                  title={item.name}
                >
                  {displayName(item.name)}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone="accent">Current version</Badge>
                  <time
                    dateTime={item.updatedAt}
                    title={absoluteStamp(item.updatedAt)}
                    className="mono-data text-[12px] text-ink-muted"
                  >
                    {relativeStamp(item.updatedAt, now)}
                  </time>
                </div>
              </div>
            </li>

            {revisions.length === 0 ? (
              <li className="px-3 py-4 text-[13px] text-ink-faint">
                No earlier versions yet. Edit this item and the previous version
                shows up here.
              </li>
            ) : (
              revisions.map((revision) => {
                const preview = vault.openRevision(item, revision);
                return (
                  <li
                    key={revision.id}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className="truncate text-[13.5px] font-medium text-ink"
                        title={preview.name}
                      >
                        {displayName(preview.name)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge tone="neutral">Version {revision.revision}</Badge>
                        <time
                          dateTime={revision.createdAt}
                          title={absoluteStamp(revision.createdAt)}
                          className="mono-data text-[12px] text-ink-muted"
                        >
                          {relativeStamp(revision.createdAt, now)}
                        </time>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={restoring}
                      className="shrink-0"
                      aria-label={`Restore version ${revision.revision}`}
                      onClick={() => setPending(revision)}
                    >
                      Restore
                    </Button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => {
          if (!restoring) setPending(null);
        }}
        onConfirm={() => void handleRestore()}
        title="Restore this version?"
        description={
          pending
            ? `Ahaai saves the current version to history first, then puts version ${pending.revision} back as the live content. Because the version it replaces is kept, you can undo this restore.`
            : ""
        }
        confirmLabel="Restore this version"
        tone="primary"
        loading={restoring}
      />
    </>
  );
}
