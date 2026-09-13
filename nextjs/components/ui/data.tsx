"use client";

import { useState, type ReactNode } from "react";
import { cn } from "./cn";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("panel", className)}>{children}</section>;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[12.5px] text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono-data inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface-2 px-1 text-[11px] text-ink-muted">
      {children}
    </kbd>
  );
}

/** Mono value with a title fallback so truncated secrets stay reachable. */
export function MonoValue({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      title={value}
      className={cn("mono-data block truncate text-[13px] text-ink", className)}
    >
      {value}
    </span>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
      window.setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 2400);
    }
  }

  const accessible =
    state === "done" ? "Copied" : state === "error" ? "Copy failed" : label;

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={accessible}
      title={accessible}
      className={cn(
        "inline-grid size-8 place-items-center rounded-md transition-colors",
        state === "done" ? "text-success" : "text-ink-faint hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {state === "done" ? (
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <rect
            x="5.5"
            y="5.5"
            width="8"
            height="8"
            rx="1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10.5 3.5H3.6A1.1 1.1 0 0 0 2.5 4.6v6.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

const SCORE_LABEL = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

/** Score alone is not a state cue: the label carries the meaning too. */
export function StrengthMeter({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(4, score));
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index < safe
                ? safe <= 1
                  ? "bg-danger"
                  : safe === 2
                    ? "bg-warning"
                    : "bg-success"
                : "bg-surface-3",
            )}
          />
        ))}
      </div>
      <p className="text-[12.5px] text-ink-faint">
        Strength: <span className="text-ink-muted">{SCORE_LABEL[safe]}</span>
      </p>
    </div>
  );
}
