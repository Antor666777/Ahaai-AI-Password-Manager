"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown date" : DATE.format(parsed);
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown time"
    : DATE_TIME.format(parsed);
}

export interface SettingsSectionProps {
  /** Anchor id; the heading id is derived from it. */
  id: string;
  title: string;
  /** One line on why this group exists and what changing it costs. */
  consequence: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  id,
  title,
  consequence,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn("space-y-4", className)}
    >
      <div className="space-y-1">
        <h2 id={`${id}-heading`} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        <p className="max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
          {consequence}
        </p>
      </div>
      {children}
    </section>
  );
}

export function SettingList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn("divide-y divide-line", className)}>{children}</dl>;
}

export function SettingRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4",
        className,
      )}
    >
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-relaxed text-ink">
        {children}
      </dd>
    </div>
  );
}

/** A named action with its consequence written next to the control. */
export function ActionRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-4 first:border-t-0">
      <div className="min-w-0 max-w-[52ch] space-y-0.5">
        <h3 className="text-[13px] font-medium text-ink">{title}</h3>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {control}
      </div>
    </div>
  );
}
