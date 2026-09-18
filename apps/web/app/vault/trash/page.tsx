"use client";

import { TrashPanel } from "@/components/app/trash/TrashPanel";
import { Callout } from "@/components/ui/feedback";

export default function TrashPage() {
  return (
    <div className="space-y-9">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">Trash</h1>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-muted">
          Deleting an item moves it here. Nothing leaves your vault until you
          purge it.
        </p>
      </header>

      <div className="space-y-6">
        <TrashPanel />
        <Callout tone="neutral" title="Purging reaches other devices on the next sync">
          A purge on this device is final here straight away. Other signed in
          devices keep the old copy until they finish a full resync.
        </Callout>
      </div>
    </div>
  );
}
