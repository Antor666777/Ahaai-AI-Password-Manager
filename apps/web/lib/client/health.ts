"use client";

import { sha1HexUpper, sha256Hex } from "@ahaai/core/hibp/hash";
import { api } from "./api";
import type { DecryptedItem } from "./types";

/**
 * Password health analysis. Everything here runs in the browser: the item
 * password is hashed locally and only the first five hex characters of its
 * SHA-1 digest ever reach the network, via the k-anonymity range API. The
 * SHA-256 used for reuse detection never leaves this module.
 */

export type HealthStatus = "breached" | "reused" | "weak" | "stale";

/** A password older than this many days is flagged as stale. */
export const STALE_AFTER_DAYS = 180;
/** Anything shorter than this is weak, regardless of the characters used. */
export const WEAK_LENGTH = 12;
/** Matches the batch endpoint's schema; the sweep is chunked to this size. */
export const MAX_PREFIXES_PER_REQUEST = 200;

export interface HealthEntry {
  item: DecryptedItem;
  /** Every status this item trips; empty means healthy. An item can have many. */
  statuses: HealthStatus[];
  /** How many breach records the password appears in; 0 when not found. */
  breachCount: number;
  /** How many login items share this exact password, including this one. */
  reuseCount: number;
  passwordLength: number;
  /** Distinct character classes (lower, upper, digit, symbol), 1-4. */
  characterClasses: number;
  ageDays: number;
}

export interface HealthSummary {
  /** Login items with a stored password that were examined. */
  total: number;
  breached: number;
  reused: number;
  weak: number;
  stale: number;
  /** Items that tripped no status at all. */
  healthy: number;
  /** Aggregate 0-100 score; 100 is every password clean and unique. */
  score: number;
}

export interface HealthReport {
  ok: true;
  entries: HealthEntry[];
  summary: HealthSummary;
  checkedAt: number;
}

export interface HealthFailure {
  ok: false;
  error: string;
}

export type HealthResult = HealthReport | HealthFailure;

interface AnalyzedItem {
  item: DecryptedItem;
  password: string;
  /** Full 40-character upper-case SHA-1 of the password. */
  hash: string;
  prefix: string;
  /** Hex SHA-256 of the password. Local only; never sent anywhere. */
  reuseKey: string;
  ageDays: number;
}

/** prefix -> (suffix -> count). Survives remounts, so reopening is free. */
const rangeCache = new Map<string, Map<string, number>>();

/** Test/teardown hook: drops the in-module prefix cache. */
export function resetHealthCache(): void {
  rangeCache.clear();
}

function loginPassword(item: DecryptedItem): string | null {
  if (item.type !== "login") return null;
  const data = item.data as { password?: unknown };
  if (typeof data.password !== "string" || data.password.length === 0) return null;
  return data.password;
}

/** Lower, upper, digit and symbol count as four distinct classes. */
function characterClassCount(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  return classes;
}

function ageInDays(updatedAt: string, now: number): number {
  const time = Date.parse(updatedAt);
  if (Number.isNaN(time)) return 0;
  return Math.floor(Math.max(0, now - time) / 86_400_000);
}

/** Parses the raw `SUFFIX:COUNT` lines into a suffix -> count lookup. */
function parseSuffixes(suffixes: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of suffixes.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const colon = trimmed.lastIndexOf(":");
    if (colon === -1) continue;
    const suffix = trimmed.slice(0, colon).trim().toUpperCase();
    if (suffix.length === 0) continue;
    const count = Number.parseInt(trimmed.slice(colon + 1).trim(), 10);
    if (!Number.isInteger(count) || count < 0) continue;
    counts.set(suffix, count);
  }
  return counts;
}

function chunk<T>(values: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "Could not reach the breach list. Check your connection and try again.";
}

/**
 * How much a single flagged item drags the score down, by the worst issues it
 * carries. Capped at 1 so one very bad item cannot sink the whole vault alone.
 */
const SEVERITY: Record<HealthStatus, number> = {
  breached: 1,
  reused: 0.75,
  weak: 0.5,
  stale: 0.25,
};

function scoreFor(entries: HealthEntry[], total: number): number {
  if (total === 0) return 100;
  let penalty = 0;
  for (const entry of entries) {
    if (entry.statuses.length === 0) continue;
    penalty += Math.min(
      1,
      entry.statuses.reduce((sum, status) => sum + SEVERITY[status], 0),
    );
  }
  return Math.max(0, Math.round(100 * (1 - penalty / total)));
}

export interface AnalyzeOptions {
  /** Overrides the clock; handy for deterministic age tests. */
  now?: number;
  /** Overrides the range lookup. Defaults to the real batch API. */
  fetchRanges?: (
    prefixes: string[],
  ) => Promise<{ prefix: string; suffixes: string; cached: boolean }[]>;
}

/**
 * Sweeps every login item with a password and classifies it. Never throws: a
 * failed range fetch comes back as `{ ok: false }` so a render tree can show an
 * error state instead of crashing.
 */
export async function analyzeVault(
  items: DecryptedItem[],
  options: AnalyzeOptions = {},
): Promise<HealthResult> {
  const now = options.now ?? Date.now();
  const fetchRanges =
    options.fetchRanges ??
    (async (prefixes: string[]) => (await api.pwnedRanges(prefixes)).ranges);

  const analyzed: AnalyzedItem[] = [];
  const reuseCounts = new Map<string, number>();
  const uniquePrefixes = new Set<string>();

  for (const item of items) {
    const password = loginPassword(item);
    if (password === null) continue;
    const hash = sha1HexUpper(password);
    const reuseKey = sha256Hex(password);
    analyzed.push({
      item,
      password,
      hash,
      prefix: hash.slice(0, 5),
      reuseKey,
      ageDays: ageInDays(item.updatedAt, now),
    });
    uniquePrefixes.add(hash.slice(0, 5));
    reuseCounts.set(reuseKey, (reuseCounts.get(reuseKey) ?? 0) + 1);
  }

  // Only the prefixes still missing from the cache need a round trip.
  const missing = [...uniquePrefixes].filter((prefix) => !rangeCache.has(prefix));
  try {
    for (const batch of chunk(missing, MAX_PREFIXES_PER_REQUEST)) {
      const ranges = await fetchRanges(batch);
      for (const range of ranges) {
        rangeCache.set(range.prefix.toUpperCase(), parseSuffixes(range.suffixes));
      }
    }
  } catch (caught) {
    return { ok: false, error: messageOf(caught) };
  }

  const entries: HealthEntry[] = [];
  const summary: HealthSummary = {
    total: analyzed.length,
    breached: 0,
    reused: 0,
    weak: 0,
    stale: 0,
    healthy: 0,
    score: 100,
  };

  for (const analyzedItem of analyzed) {
    const suffix = analyzedItem.hash.slice(5);
    const breachCount =
      rangeCache.get(analyzedItem.prefix)?.get(suffix) ?? 0;
    const reuseCount = reuseCounts.get(analyzedItem.reuseKey) ?? 1;
    const classes = characterClassCount(analyzedItem.password);

    const statuses: HealthStatus[] = [];
    if (breachCount > 0) statuses.push("breached");
    if (reuseCount > 1) statuses.push("reused");
    if (analyzedItem.password.length < WEAK_LENGTH || classes <= 1) {
      statuses.push("weak");
    }
    if (analyzedItem.ageDays > STALE_AFTER_DAYS) statuses.push("stale");

    if (statuses.includes("breached")) summary.breached += 1;
    if (statuses.includes("reused")) summary.reused += 1;
    if (statuses.includes("weak")) summary.weak += 1;
    if (statuses.includes("stale")) summary.stale += 1;
    if (statuses.length === 0) summary.healthy += 1;

    entries.push({
      item: analyzedItem.item,
      statuses,
      breachCount,
      reuseCount,
      passwordLength: analyzedItem.password.length,
      characterClasses: classes,
      ageDays: analyzedItem.ageDays,
    });
  }

  summary.score = scoreFor(entries, summary.total);
  return { ok: true, entries, summary, checkedAt: now };
}
