"use client";

import type { DecryptedItem } from "@/lib/client/types";
import { ItemRow } from "./ItemRow";

export interface ItemListProps {
  items: DecryptedItem[];
  folderNameOf: (folderId: string | null) => string | null;
  selectedId: string | null;
  favoriteBusyId: string | null;
  onOpen: (item: DecryptedItem) => void;
  onToggleFavorite: (item: DecryptedItem) => void;
  onTrash: (item: DecryptedItem) => void;
}

export function ItemList({
  items,
  folderNameOf,
  selectedId,
  favoriteBusyId,
  onOpen,
  onToggleFavorite,
  onTrash,
}: ItemListProps) {
  return (
    <ul aria-label="Vault items">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          folderName={folderNameOf(item.folderId)}
          selected={item.id === selectedId}
          favoriteBusy={favoriteBusyId === item.id}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          onTrash={onTrash}
        />
      ))}
    </ul>
  );
}
