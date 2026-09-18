"use client";

import { Button } from "@/components/ui/button";

export interface UndoBarProps {
  name: string;
  busy: boolean;
  onRestore: () => void;
  onDismiss: () => void;
}

/** Trashing has no confirmation, so it offers the way back right away. */
export function UndoBar({ name, busy, onRestore, onDismiss }: UndoBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
      <p role="status" className="min-w-0 text-[13px] text-ink-muted">
        <span className="font-medium text-ink" title={name}>
          {name}
        </span>{" "}
        moved to trash.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onRestore} loading={busy}>
          Restore item
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
