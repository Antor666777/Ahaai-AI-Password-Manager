import { useEffect, useState } from "react";
import type { BadgeTone } from "@/components/ui/feedback";

const DAY_MS = 86_400_000;

/** Re-renders the caller on a timer so relative stamps stay honest. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(handle);
  }, [intervalMs]);
  return now;
}

function plural(value: number, unit: string): string {
  return value === 1 ? `1 ${unit}` : `${value} ${unit}s`;
}

function humanize(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 45) return "a moment";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return plural(days, "day");
  const months = Math.round(days / 30);
  if (months < 12) return plural(months, "month");
  return plural(Math.round(months / 12), "year");
}

/** Relative time for reading; the absolute value belongs in a title. */
export function relativeStamp(iso: string | null, now: number): string {
  if (!iso) return "unknown";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "unknown";
  const delta = time - now;
  if (Math.abs(delta) < 45_000) return delta >= 0 ? "in a moment" : "just now";
  const body = humanize(Math.abs(delta));
  return delta > 0 ? `in ${body}` : `${body} ago`;
}

export function absoluteStamp(iso: string | null): string {
  if (!iso) return "Time not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "Date not recorded";
  const today = startOfDay(now);
  const day = startOfDay(time);
  const diffDays = Math.round((today - day) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const date = new Date(time);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

const PLATFORM_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone/i, "iPhone"],
  [/iPad/i, "iPad"],
  [/Android/i, "Android"],
  [/CrOS/i, "Chromebook"],
  [/Windows/i, "Windows"],
  [/Macintosh|Mac OS X/i, "Mac"],
  [/Linux/i, "Linux"],
];

const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/i, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

/** Best-effort readable device, falling back to words parsed from the user agent. */
export function describeDevice(
  deviceName: string | null,
  deviceType: string | null,
  userAgent: string | null,
): string {
  const named = deviceName?.trim();
  if (named) return named;

  const agent = userAgent ?? "";
  const browser =
    BROWSER_PATTERNS.find(([pattern]) => pattern.test(agent))?.[1] ?? null;
  const platform =
    PLATFORM_PATTERNS.find(([pattern]) => pattern.test(agent))?.[1] ?? null;

  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return platform;
  if (deviceType) return deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
  return "Unknown device";
}

const EVENT_LABELS: Record<string, string> = {
  "auth.register": "Account created",
  "auth.login.success": "Signed in",
  "auth.login.failed": "Failed sign in",
  "auth.logout": "Signed out",
  "auth.password.changed": "Master password changed",
  "auth.email.changed": "Email address changed",
  "auth.verify.failed": "Master password check failed",
  "auth.account.deleted": "Account deleted",
  "session.revoked": "Session revoked",
  "session.revoked_all": "Signed out other devices",
  "session.reuse_detected": "Stale session reused",
  "vault.item.created": "Item added",
  "vault.item.updated": "Item updated",
  "vault.item.deleted": "Item moved to trash",
  "vault.item.restored": "Item restored",
  "vault.item.purged": "Item purged",
  "vault.items.bulk_created": "Items imported",
  "vault.items.bulk_updated": "Items changed in bulk",
  "vault.tag.created": "Tag created",
  "vault.tag.updated": "Tag renamed",
  "vault.tag.deleted": "Tag deleted",
  "ai.provider.created": "AI provider added",
  "ai.provider.updated": "AI provider updated",
  "ai.provider.deleted": "AI provider removed",
  "ai.search.performed": "Vault search run",
  "pwned.range.checked": "Breach list checked",
};

/** Event types become plain words; unknown types degrade to readable text. */
export function eventLabel(type: string): string {
  const known = EVENT_LABELS[type];
  if (known) return known;
  const words = type.replace(/[._-]+/g, " ").trim();
  if (words.length === 0) return "Recorded activity";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function severityMeta(severity: string): { tone: BadgeTone; word: string } {
  switch (severity) {
    case "critical":
      return { tone: "danger", word: "Critical" };
    case "warning":
      return { tone: "warning", word: "Warning" };
    default:
      return { tone: "neutral", word: "Notice" };
  }
}

/** Supplementary to the badge word, never the only cue. */
export function severityDot(severity: string): string {
  if (severity === "critical") return "bg-danger";
  if (severity === "warning") return "bg-warning";
  return "bg-line-strong";
}
