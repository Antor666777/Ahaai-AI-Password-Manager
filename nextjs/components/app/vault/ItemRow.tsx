"use client";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { DecryptedItem } from "@/lib/client/types";
import { StarIcon, TrashIcon } from "@/components/app/shell/Icons";
import { typeLabel } from "@/components/app/item/meta";
import { TypeGlyph } from "@/components/app/item/TypeGlyph";

export interface ItemRowProps {
  item: DecryptedItem;
  folderName: string | null;
  selected: boolean;
  favoriteBusy: boolean;
  onOpen: (item: DecryptedItem) => void;
  onToggleFavorite: (item: DecryptedItem) => void;
  onTrash: (item: DecryptedItem) => void;
}

/**
 * The whole row body opens the inspector and is a real button. The two icon
 * buttons sit beside it rather than inside it, so nothing is nested.
 */
export function ItemRow({
  item,
  folderName,
  selected,
  favoriteBusy,
  onOpen,
  onToggleFavorite,
  onTrash,
}: ItemRowProps) {
  return (
    <li className={cn("border-t border-line first:border-t-0", selected && "bg-surface-2")}>
      <div className="flex items-center gap-1 ps-3 pe-1.5">
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-current={selected ? "true" : undefined}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-sm pe-1 py-1.5 text-left"
        >
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
