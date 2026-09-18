"use client";

import Link from "next/link";
import { useVault } from "@/lib/client/vault";
import { FolderIcon } from "./Icons";

/**
 * Folders are a filter, not a page, so each one links to the vault with a
 * folder already applied. The list stays link-only: no click targets here.
 */
export function FolderNav({ onNavigate }: { onNavigate?: () => void }) {
  const { folders, loading } = useVault();

  return (
    <section aria-labelledby="ahaai-folders-heading">
      <h2
        id="ahaai-folders-heading"
        className="px-3 text-[11px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Folders
      </h2>

      {folders.length === 0 ? (
        <p className="px-3 pt-2 text-[12.5px] leading-snug text-ink-faint">
          {loading
            ? "Loading folders"
            : "No folders yet. Folders group items into things like Work or Personal."}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {folders.map((folder) => (
            <li key={folder.id}>
              <Link
                href={`/vault?folder=${encodeURIComponent(folder.id)}`}
                onClick={onNavigate}
                title={folder.name}
                className="flex h-11 items-center gap-2.5 truncate rounded-md px-3 text-[13px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <FolderIcon className="size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
