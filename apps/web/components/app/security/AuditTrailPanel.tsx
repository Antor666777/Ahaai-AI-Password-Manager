"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   The audit trail loads from the API on mount and pages older entries on
   demand. Every setState lands after the awaited request resolves, which is the
   intended data loading pattern for a client component. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Divider, Panel, PanelHeader } from "@/components/ui/data";
import { Badge, Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import type { ApiAuditEvent } from "@/lib/client/types";
import {
  absoluteStamp,
  dayKey,
  dayLabel,
  eventLabel,
  relativeStamp,
  severityDot,
  severityMeta,
  useNow,
} from "./format";

const PAGE_SIZE = 25;

type LoadState = "loading" | "ready" | "error";

interface DayGroup {
  key: string;
  label: string;
  events: ApiAuditEvent[];
}

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "The server did not answer. Check your connection, then try again.";
}

/** Input is newest first, so equal days are always adjacent. */
function groupByDay(events: ApiAuditEvent[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const key = dayKey(event.createdAt);
    const last = groups.at(-1);
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, label: dayLabel(event.createdAt, now), events: [event] });
  }
  return groups;
}

function EventRow({ event, now }: { event: ApiAuditEvent; now: number }) {
  const severity = severityMeta(event.severity);
  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${severityDot(event.severity)}`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13px] font-medium text-ink">{eventLabel(event.type)}</p>
          <Badge tone={severity.tone}>{severity.word}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
          <time
            dateTime={event.createdAt}
            title={absoluteStamp(event.createdAt)}
            className="mono-data text-ink-muted"
          >
            {relativeStamp(event.createdAt, now)}
          </time>
          <span className="mono-data">{event.ipAddress ?? "Origin not recorded"}</span>
          {event.userAgent ? (
            <span
              className="mono-data max-w-[32ch] truncate"
              title={event.userAgent}
            >
              {event.userAgent}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function AuditTrailPanel() {
  const toast = useToast();
  const now = useNow();
  const [events, setEvents] = useState<ApiAuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await api.events({ limit: PAGE_SIZE });
      setEvents(result.events);
      setCursor(result.nextCursor);
      setState("ready");
    } catch (caught) {
      setError(messageOf(caught));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupByDay(events, now), [events, now]);

  async function loadOlder() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.events({ limit: PAGE_SIZE, before: cursor });
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return [
          ...current,
          ...result.events.filter((event) => !seen.has(event.id)),
        ];
      });
      setCursor(result.nextCursor);
    } catch (caught) {
      toast.error("Could not load older events", messageOf(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Activity"
        description="Everything Ahaai has recorded for this account, newest first."
      />

      {state === "loading" ? (
        <div role="status" className="space-y-4 p-4">
          <span className="sr-only">Loading recorded activity.</span>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          ))}
        </div>
      ) : null}

      {state === "error" ? (
        <div role="alert" className="space-y-3 p-4">
          <Callout tone="danger" title="Activity did not load">
            {error}
          </Callout>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      ) : null}

      {state === "ready" && events.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path
                d="M10 5v5l3 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="10"
                cy="10"
                r="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          }
          title="Nothing recorded yet"
          description="Ahaai records sign ins, failed attempts, session and password changes, and vault edits here. The list fills as you use the vault."
        />
      ) : null}

      {state === "ready" && events.length > 0 ? (
        <ol className="space-y-4 py-2">
          {groups.map((group) => (
            <li key={group.key}>
              <div className="flex items-center gap-3 px-4 py-1">
                <h3 className="text-[12px] font-semibold tracking-wide text-ink-faint uppercase">
                  {group.label}
                </h3>
                <Divider className="flex-1" />
              </div>
              <ul className="divide-y divide-line">
                {group.events.map((event) => (
                  <EventRow key={event.id} event={event} now={now} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}

      {state === "ready" && cursor ? (
        <div className="border-t border-line px-4 py-3">
          <Button onClick={() => void loadOlder()} loading={loadingMore}>
            Load older events
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
