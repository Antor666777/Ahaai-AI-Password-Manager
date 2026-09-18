"use client";

import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { PlusIcon, VaultIcon } from "@/components/app/shell/Icons";

/** Rows keep their 52px shape while the vault decrypts, so nothing reflows. */
export function ItemListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" className="px-3 py-2">
      <span className="sr-only">Loading items</span>
      <div className="space-y-1">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex h-[52px] items-center gap-3">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyVault({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={<VaultIcon className="size-5" />}
      title="Your vault is empty"
      description="A login, a card, an identity, or a secure note all live here. Each one is sealed with your master password before it leaves this tab."
      action={
        <Button variant="primary" onClick={onCreate}>
          <PlusIcon className="size-4" />
          Create your first item
        </Button>
      }
    />
  );
}

export function NoFilterMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="No items match these filters"
      description="The vault has items, but none fit the type, folder, and favorites you picked. Clear the filters to see all of them."
      action={<Button onClick={onClear}>Clear filters</Button>}
    />
  );
}
