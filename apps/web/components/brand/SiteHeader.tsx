"use client";

import { IconButton } from "@/components/ui/button";
import { useTheme } from "@/lib/client/theme";
import { Wordmark } from "./Wordmark";

/**
 * Three things only: the wordmark, the way to the auth panel, and the theme
 * the reader picked. Every one of them works.
 */
export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex min-h-14 w-full max-w-[84rem] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6 lg:px-9">
        <a
          href="#top"
          className="inline-flex items-center rounded-sm py-1"
          aria-label="Ahaai, back to the top of this page"
        >
          <Wordmark />
        </a>

        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="#auth-panel"
            className="rounded-sm px-2 py-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink sm:text-[13px]"
          >
            Create account or sign in
          </a>
          <IconButton
            label={`Switch to the ${nextTheme} theme`}
            onClick={toggle}
            className="text-ink-muted hover:text-ink"
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <circle
                  cx="10"
                  cy="10"
                  r="3.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path
                  d="M16.2 12.4A7 7 0 0 1 7.6 3.8a7 7 0 1 0 8.6 8.6Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </IconButton>
        </div>
      </div>
    </header>
  );
}
