"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useHotkeys } from "@/lib/client/hotkeys";
import { CommandPalette } from "./CommandPalette";
import { Drawer } from "./Drawer";
import { MobileTopBar } from "./MobileTopBar";
import { Rail } from "./Rail";

/**
 * The authenticated frame. One breakpoint moves it: below 1024px the rail
 * folds into a top bar plus a drawer, at 1024px and up it becomes the
 * permanent left column.
 */
export function VaultShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K opens the palette from anywhere, including while a field has
  // focus, so it works as the one universal entry point.
  useHotkeys([
    {
      key: "k",
      mod: true,
      allowInInput: true,
      handler: () => setPaletteOpen(true),
    },
  ]);

  // A drawer opened on a phone must not linger as a hidden modal when the
  // window grows past the rail breakpoint.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const handle = () => {
      if (query.matches) setDrawerOpen(false);
    };
    handle();
    query.addEventListener("change", handle);
    return () => query.removeEventListener("change", handle);
  }, []);

  return (
    <div className="min-h-dvh bg-paper">
      <a
        href="#vault-main"
        className="sr-only rounded-md bg-surface px-3 py-2 text-[13px] text-ink focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50"
      >
        Skip to the vault
      </a>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-e border-line bg-surface-2 lg:block">
          <Rail />
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <MobileTopBar onOpenMenu={() => setDrawerOpen(true)} />
          <main id="vault-main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="Vault navigation"
      >
        <Rail
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
        />
      </Drawer>

      {paletteOpen ? (
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      ) : null}
    </div>
  );
}
