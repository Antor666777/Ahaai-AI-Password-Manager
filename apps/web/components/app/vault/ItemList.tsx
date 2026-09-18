"use client";

import { Checkbox } from "@/components/ui/controls";
import type { DecryptedItem } from "@/lib/client/types";
import { ItemRow } from "./ItemRow";

export interface ItemListProps {
  items: DecryptedItem[];
  folderNameOf: (folderId: string | null) => string | null;
  selectedId: string | null;
  favoriteBusyId: string | null;
  selectedIds: ReadonlySet<string>;
  onOpen: (item: DecryptedItem) => void;
  onToggleFavorite: (item: DecryptedItem) => void;
  onTrash: (item: DecryptedItem) => void;
  onToggleSelected: (item: DecryptedItem, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
}

/**
 * The header's select-all covers exactly the rows this list shows, so it can
 * only ever reach what the current filters put on screen. It reads as mixed
 * when some but not all of them are selected.
 */
export function ItemList({
  items,
  folderNameOf,
  selectedId,
  favoriteBusyId,
  selectedIds,
  onOpen,
  onToggleFavorite,
  onTrash,
  onToggleSelected,
  onToggleSelectAll,
}: ItemListProps) {
  const selectedCount = items.filter((item) => selectedIds.has(item.id)).length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <Checkbox
          label="Select all"
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          onChange={onToggleSelectAll}
        />
        <p className="ms-auto text-[12.5px] text-ink-faint">
          {selectedCount > 0
            ? `${selectedCount} of ${items.length} selected`
            : `${items.length} ${items.length === 1 ? "item" : "items"}`}
        </p>
      </div>

      <ul aria-label="Vault items">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            folderName={folderNameOf(item.folderId)}
            selected={item.id === selectedId}
            favoriteBusy={favoriteBusyId === item.id}
            selectedForBulk={selectedIds.has(item.id)}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onTrash={onTrash}
            onToggleSelected={onToggleSelected}
          />
        ))}
      </ul>
    </div>
  );
}
