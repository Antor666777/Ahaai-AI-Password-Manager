"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Panel, PanelHeader } from "@/components/ui/data";
import { Badge, Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";
import type { DecryptedItem } from "@/lib/client/types";
import { BulkActionBar } from "@/components/app/vault/BulkActionBar";
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
  // Bulk selection is independent of the per-row purge target.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const busy = pendingId !== null;

  const selectedCount = trashed.filter((item) => selectedIds.has(item.id)).length;
  const allSelected = trashed.length > 0 && selectedCount === trashed.length;

  // Rows leave the list on a restore or a purge, so anything no longer present
  // drops out of the selection. A bulk action can never reach an off-screen row.
  useEffect(() => {
    // Pruning the selection to the rows still listed is the point of the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const present = new Set(trashed.map((item) => item.id));
      let pruned = false;
      const next = new Set<string>();
      for (const id of current) {
        if (present.has(id)) next.add(id);
        else pruned = true;
      }
      return pruned ? next : current;
    });
  }, [trashed]);

  const toggleSelected = useCallback((item: DecryptedItem, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const item of trashed) {
          if (checked) next.add(item.id);
          else next.delete(item.id);
        }
        return next;
      });
    },
    [trashed],
  );

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
    <Panel className={selectedIds.size > 0 ? "pb-28" : undefined}>
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
        <>
          <div className="flex items-center gap-3 border-b border-line px-4 py-2">
            <Checkbox
              label="Select all"
              checked={allSelected}
              indeterminate={selectedCount > 0 && !allSelected}
              onChange={toggleSelectAll}
            />
            <p className="ms-auto text-[12.5px] text-ink-faint">
              {selectedCount > 0
                ? `${selectedCount} of ${trashed.length} selected`
                : `${trashed.length} ${trashed.length === 1 ? "item" : "items"}`}
            </p>
          </div>

          <ul aria-label="Deleted items" className="divide-y divide-line">
            {trashed.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Checkbox
                    label={`Select ${displayName(item)}`}
                    hideLabel
                    checked={selectedIds.has(item.id)}
                    onChange={(checked) => toggleSelected(item, checked)}
                  />
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
        </>
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

      {selectedIds.size > 0 ? (
        <BulkActionBar
          ids={[...selectedIds]}
          mode="trash"
          onClear={() => setSelectedIds(new Set())}
        />
      ) : null}
    </Panel>
  );
}
