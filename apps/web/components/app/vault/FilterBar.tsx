"use client";

import { SelectField } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import type { DecryptedFolder, DecryptedTag } from "@/lib/client/types";
import { ITEM_TYPES, typeLabel } from "@/components/app/item/meta";

export interface FilterBarProps {
  typeValue: string;
  folderValue: string;
  tagValue: string;
  /** The list order: "" is name order, the default. */
  sortValue: string;
  favorites: boolean;
  count: number;
  folders: DecryptedFolder[];
  tags: DecryptedTag[];
  onTypeChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onFavoritesChange: (value: boolean) => void;
}

/**
 * The filters over one list, plus the list order. Every control is a real
 * labelled control, and the choices live in the URL so a filtered or sorted
 * view can be shared or reloaded.
 */
export function FilterBar({
  typeValue,
  folderValue,
  tagValue,
  sortValue,
  favorites,
  count,
  folders,
  tags,
  onTypeChange,
  onFolderChange,
  onTagChange,
  onSortChange,
  onFavoritesChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-line px-3 py-3">
      <SelectField
        label="Type"
        value={typeValue}
        onChange={(event) => onTypeChange(event.target.value)}
        className="w-full sm:w-40"
      >
        <option value="">All types</option>
        {ITEM_TYPES.map((type) => (
          <option key={type} value={type}>
            {typeLabel(type)}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Folder"
        value={folderValue}
        onChange={(event) => onFolderChange(event.target.value)}
        className="w-full sm:w-44"
      >
        <option value="">All folders</option>
        <option value="none">No folder</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Tag"
        value={tagValue}
        onChange={(event) => onTagChange(event.target.value)}
        className="w-full sm:w-40"
      >
        <option value="">All tags</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Sort"
        value={sortValue}
        onChange={(event) => onSortChange(event.target.value)}
        className="w-full sm:w-44"
      >
        <option value="">Name</option>
        <option value="updated">Recently updated</option>
        <option value="created">Recently created</option>
      </SelectField>

      <div className="w-full sm:w-44">
        <Switch
          label="Favorites only"
          checked={favorites}
          onChange={onFavoritesChange}
        />
      </div>

      <p className="mono-data ms-auto text-[12.5px] text-ink-faint">
        {count} {count === 1 ? "item" : "items"}
      </p>
    </div>
  );
}
