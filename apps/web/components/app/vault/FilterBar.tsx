"use client";

import { SelectField } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import type { DecryptedFolder } from "@/lib/client/types";
import { ITEM_TYPES, typeLabel } from "@/components/app/item/meta";

export interface FilterBarProps {
  typeValue: string;
  folderValue: string;
  favorites: boolean;
  count: number;
  folders: DecryptedFolder[];
  onTypeChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onFavoritesChange: (value: boolean) => void;
}

/**
 * Three filters over one list. Every control is a real labelled control, and
 * the choices live in the URL so a filtered view can be shared or reloaded.
 */
export function FilterBar({
  typeValue,
  folderValue,
  favorites,
  count,
  folders,
  onTypeChange,
  onFolderChange,
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
