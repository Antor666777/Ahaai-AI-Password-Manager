"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin-slow", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.22"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse-soft rounded-md bg-surface-2",
        className,
      )}
    />
  );
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-surface-2 text-ink-muted",
  accent: "border-accent/45 bg-accent-soft text-accent",
  success: "border-success/45 bg-success/10 text-success",
  warning: "border-warning/45 bg-warning/10 text-warning",
  danger: "border-danger/45 bg-danger/10 text-danger",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="grid size-11 place-items-center rounded-lg border border-line bg-surface-2 text-ink-faint">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-ink-muted">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "neutral" | "warning" | "danger" | "accent";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-surface-2",
    accent: "border-accent/40 bg-accent-soft",
    warning: "border-warning/45 bg-warning/10",
    danger: "border-danger/45 bg-danger/10",
  } as const;

  return (
    <div className={cn("rounded-lg border px-4 py-3", tones[tone], className)}>
      {title ? (
        <p className="text-[13px] font-semibold text-ink">{title}</p>
      ) : null}
      <div className="text-[13px] leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[13px] text-danger">
      <svg viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
