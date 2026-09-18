"use client";

import { Wordmark } from "@/components/brand/Wordmark";
import { IconButton } from "@/components/ui/button";
import { CloseIcon } from "./Icons";
import { FolderNav } from "./FolderNav";
import { RailNav } from "./RailNav";
import { SessionMenu } from "./SessionMenu";
import { ThemeToggle } from "./ThemeToggle";

export interface RailProps {
  /** Called after a link is followed, so the drawer can close itself. */
  onNavigate?: () => void;
  /** Present only when the rail is inside the mobile drawer. */
  onClose?: () => void;
}

/** One rail, two homes: the desktop column and the mobile drawer. */
export function Rail({ onNavigate, onClose }: RailProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2">
        <a
          href="/vault"
          onClick={onNavigate}
          aria-label="Ahaai, go to the vault"
          className="inline-flex items-center rounded-sm px-1 py-1"
        >
          <Wordmark />
        </a>
        {onClose ? (
          <IconButton
            label="Close navigation"
            onClick={onClose}
            className="min-h-11 min-w-11"
          >
            <CloseIcon className="size-4" />
          </IconButton>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        <RailNav onNavigate={onNavigate} />
        <div className="mt-6">
          <FolderNav onNavigate={onNavigate} />
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1 border-t border-line px-1 py-2">
        <ThemeToggle />
        <div className="min-w-0 flex-1">
          <SessionMenu onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}
