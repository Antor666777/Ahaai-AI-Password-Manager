"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/data";
import { Badge, Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";
import type { DecryptedItem } from "@/lib/client/types";
import { absoluteStamp, itemTypeLabel, relativeStamp, useNow } from "./format";

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "The server did not answer. Check your connection, then try again.";
}

function displayName(item: DecryptedItem): string {
  const name = item.name.trim();
  return name.length > 0 ? name : "Untitled item";
}

export function TrashPanel() {
  const { trashed, loading, error, restoreItem, purgeItem, reload } = useVault();
  const toast = useToast();
  const now = useNow();
  const [target, setTarget] = useState<DecryptedItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const busy = pendingId !== null;

  async function restore(item: DecryptedItem) {
    if (busy) return;
    setPendingId(item.id);
    try {
      await restoreItem(item.id);
      toast.success("Item restored", `${displayName(item)} is back in the vault.`);
    } catch (caught) {
      toast.error("Could not restore the item", messageOf(caught));
    } finally {
      setPendingId(null);
    }
  }

  async function purge() {
    if (!target || busy) return;
    const item = target;
    setPendingId(item.id);
    try {
      await purgeItem(item.id);
      toast.success("Item purged", `${displayName(item)} is gone for good.`);
      setTarget(null);
    } catch (caught) {
      toast.error("Could not purge the item", messageOf(caught));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Trash"
        description="Deleted items rest here until you put one back or purge it."
      />

      {loading ? (
        <div role="status" className="space-y-2 p-4">
          <span className="sr-only">Loading deleted items.</span>
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <div role="alert" className="space-y-3 p-4">
          <Callout tone="danger" title="Trash did not load">
            {error}
          </Callout>
          <Button onClick={() => void reload()}>Retry</Button>
        </div>
      ) : null}

      {!loading && !error && trashed.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path
                d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .7 9a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="Trash is empty"
          description="Items you delete wait here until you purge them. Restore puts one back in the vault; purge removes it for good."
        />
      ) : null}

      {!loading && !error && trashed.length > 0 ? (
        <ul className="divide-y divide-line">
          {trashed.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p
                  className="truncate text-[13.5px] font-medium text-ink"
                  title={item.name}
                >
                  {displayName(item)}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone="neutral">{itemTypeLabel(item.type)}</Badge>
                  <span className="text-[12.5px] text-ink-faint">Deleted</span>
                  <time
                    dateTime={item.deletedAt ?? undefined}
                    title={absoluteStamp(item.deletedAt)}
                    className="mono-data text-[12px] text-ink-muted"
                  >
                    {relativeStamp(item.deletedAt, now)}
                  </time>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  loading={pendingId === item.id && target === null}
                  onClick={() => void restore(item)}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setTarget(item)}
                >
                  Purge permanently
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onClose={() => {
          if (!busy) setTarget(null);
        }}
        onConfirm={() => void purge()}
        title="Purge this item permanently?"
        description={
          target
            ? `This erases ${displayName(target)} from the server for good. Nothing can bring it back, and other devices only match it after a full resync.`
            : ""
        }
        confirmLabel="Purge permanently"
        loading={pendingId !== null && target !== null && pendingId === target.id}
      />
    </Panel>
  );
}
