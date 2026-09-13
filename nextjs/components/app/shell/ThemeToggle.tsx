"use client";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useTheme } from "@/lib/client/theme";
import { MoonIcon, SunIcon } from "./Icons";

/** The rail keeps the theme switch next to the session menu, out of the way. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <IconButton
      label={`Switch to the ${next} theme`}
      onClick={toggle}
      className={cn("min-h-11 min-w-11 text-ink-muted hover:text-ink", className)}
    >
      {theme === "dark" ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </IconButton>
  );
}
