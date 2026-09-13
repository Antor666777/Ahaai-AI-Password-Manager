"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { IconButton } from "@/components/ui/button";
import { MenuIcon } from "./Icons";

/** Below the rail breakpoint the shell keeps only the wordmark and a door. */
export function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2 lg:hidden">
      <Link
        href="/vault"
        aria-label="Ahaai, go to the vault"
        className="inline-flex items-center rounded-sm px-1 py-1"
      >
        <Wordmark />
      </Link>
      <IconButton
        label="Open navigation"
        onClick={onOpenMenu}
        className="min-h-11 min-w-11"
      >
        <MenuIcon className="size-4" />
      </IconButton>
    </header>
  );
}
