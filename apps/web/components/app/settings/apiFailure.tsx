"use client";

import { ApiError } from "@/lib/client/api";

/**
 * One place that turns a failed request into copy. Every message states what
 * broke and the next move, and validation issues come back as Zod issue paths
 * so a field can own its own message.
 */
export interface ApiFailure {
  code: string;
  /** Whatever the server said, when it said something worth showing. */
  serverMessage: string | null;
  /** Names of the request fields the server rejected. */
  fields: string[];
  retryAfterSeconds: number | null;
}

function retrySecondsFrom(details: unknown): number | null {
  if (typeof details !== "object" || details === null) return null;
  const raw = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(1, Math.ceil(raw))
    : null;
}

function fieldsFrom(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  const names: string[] = [];
  for (const issue of details) {
    if (typeof issue !== "object" || issue === null) continue;
    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path)) continue;
    const [first] = path;
    if (typeof first === "string" && !names.includes(first)) names.push(first);
  }
  return names;
}

export function describeApiFailure(caught: unknown): ApiFailure {
  if (caught instanceof ApiError) {
    return {
      code: caught.code,
      serverMessage: caught.message,
      fields: fieldsFrom(caught.details),
      retryAfterSeconds: retrySecondsFrom(caught.details),
    };
  }
  return {
    code: "INTERNAL",
    serverMessage: null,
    fields: [],
    retryAfterSeconds: null,
  };
}

/** A plain sentence for the failure, ending in the next move. */
export function failureCopy(failure: ApiFailure, fallback: string): string {
  switch (failure.code) {
    case "NETWORK":
      return "Could not reach the server. Check your connection, then try again.";
    case "UNAUTHORIZED":
      return "This session is no longer signed in. Sign in again, then retry this.";
    case "FORBIDDEN":
      return "The server turned this request away. Reload the page, then try again.";
    case "RATE_LIMITED":
      return failure.retryAfterSeconds === null
        ? "Too many requests came from this account. Wait a minute, then try again."
        : `Too many requests came from this account. Wait ${failure.retryAfterSeconds} seconds, then try again.`;
    case "UPSTREAM":
      return "The provider did not answer. Check the API key and the base URL, then test the connection again.";
    case "NOT_FOUND":
      return "That record is no longer in this account. Reload the page, then try again.";
    case "CONFLICT":
    case "BAD_REQUEST":
      return failure.serverMessage ?? fallback;
    default:
      return fallback;
  }
}
