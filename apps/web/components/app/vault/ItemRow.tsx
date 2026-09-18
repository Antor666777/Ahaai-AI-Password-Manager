"use client";

import { IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { cn } from "@/components/ui/cn";
import type { DecryptedItem } from "@/lib/client/types";
import { StarIcon, TrashIcon } from "@/components/app/shell/Icons";
import { typeLabel } from "@/components/app/item/meta";
import { TypeGlyph } from "@/components/app/item/TypeGlyph";

export interface ItemRowProps {
  item: DecryptedItem;
  folderName: string | null;
  /** The inspector is open on this row. */
  selected: boolean;
  favoriteBusy: boolean;
  /** This row is part of the bulk selection. */
  selectedForBulk: boolean;
  onOpen: (item: DecryptedItem) => void;
  onToggleFavorite: (item: DecryptedItem) => void;
  onTrash: (item: DecryptedItem) => void;
  onToggleSelected: (item: DecryptedItem, checked: boolean) => void;
}

/**
 * The selection checkbox is a sibling of the row body rather than a child, so
 * the two never nest. The whole row body opens the inspector and is a real
 * button; the two icon buttons sit beside it.
 */
export function ItemRow({
  item,
  folderName,
  selected,
  favoriteBusy,
  selectedForBulk,
  onOpen,
  onToggleFavorite,
  onTrash,
  onToggleSelected,
}: ItemRowProps) {
  const body = (
    <>
      <TypeGlyph type={item.type} />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[14px] font-medium text-ink"
          title={item.name}
        >
          {item.name}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-faint">
          {typeLabel(item.type)}
          <span aria-hidden="true"> · </span>
          {folderName ?? "No folder"}
        </span>
      </span>
    </>
  );

  return (
    <li
      className={cn(
        "border-t border-line first:border-t-0",
        (selected || selectedForBulk) && "bg-surface-2",
      )}
    >
      <div className="flex items-center gap-1 ps-3 pe-1.5">
        <Checkbox
          label={`Select ${item.name}`}
          hideLabel
          checked={selectedForBulk}
          onChange={(checked) => onToggleSelected(item, checked)}
        />

        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-current={selected ? "true" : undefined}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-sm pe-1 py-1.5 text-left"
        >
          {body}
        </button>

        <IconButton
          label={
            item.favorite
              ? `Remove ${item.name} from favorites`
              : `Add ${item.name} to favorites`
          }
          aria-pressed={item.favorite}
          disabled={favoriteBusy}
          onClick={() => onToggleFavorite(item)}
          className="min-h-11 min-w-11"
        >
          <StarIcon
            filled={item.favorite}
            className={item.favorite ? "text-primary" : undefined}
          />
        </IconButton>

        <IconButton
          label={`Move ${item.name} to trash`}
          onClick={() => onTrash(item)}
          className="min-h-11 min-w-11"
        >
          <TrashIcon />
        </IconButton>
      </div>
    </li>
  );
}
