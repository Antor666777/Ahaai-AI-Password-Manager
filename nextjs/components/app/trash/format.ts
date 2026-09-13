import { useEffect, useState } from "react";
import type { ItemType } from "@/lib/client/types";

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

export function itemTypeLabel(type: ItemType): string {
  switch (type) {
    case "login":
      return "Login";
    case "card":
      return "Card";
    case "identity":
      return "Identity";
    case "secure_note":
      return "Secure note";
    default:
      return "Item";
  }
}
