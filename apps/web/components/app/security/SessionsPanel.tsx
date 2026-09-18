"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   Sessions load from the API on mount. The setState that follows lands after
   the awaited request resolves, which is the intended data loading pattern for
   a client component. */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/data";
import { Badge, Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import type { ApiSessionInfo } from "@/lib/client/types";
import { absoluteStamp, describeDevice, relativeStamp, useNow } from "./format";

type LoadState = "loading" | "ready" | "error";

function messageOf(caught: unknown): string {
  if (caught instanceof Error && caught.message.length > 0) return caught.message;
  return "The server did not answer. Check your connection, then try again.";
}

export function SessionsPanel() {
  const toast = useToast();
  const now = useNow();
  const [sessions, setSessions] = useState<ApiSessionInfo[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ApiSessionInfo | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await api.sessions();
      setSessions(result.sessions);
      setState("ready");
    } catch (caught) {
      setError(messageOf(caught));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const targetLabel = target
    ? describeDevice(target.deviceName, target.deviceType, target.userAgent)
    : "";

  async function revoke() {
    if (!target || pending) return;
    setPending(true);
    try {
      await api.revokeSession(target.id);
      setSessions((current) => current.filter((entry) => entry.id !== target.id));
      toast.success("Session revoked", `${targetLabel} must sign in again to open the vault.`);
      setTarget(null);
    } catch (caught) {
      toast.error("Could not revoke the session", messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Active sessions"
        description="Every browser and device holding a live session for this account."
      />

      {state === "loading" ? (
        <div role="status" className="space-y-2 p-4">
          <span className="sr-only">Loading active sessions.</span>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-11 w-full" />
          ))}
        </div>
      ) : null}

      {state === "error" ? (
        <div role="alert" className="space-y-3 p-4">
          <Callout tone="danger" title="Sessions did not load">
            {error}
          </Callout>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      ) : null}

      {state === "ready" && sessions.length === 0 ? (
        <EmptyState
          title="No sessions on record"
          description="A session appears here as soon as this account signs in from a browser or device."
        />
      ) : null}

      {state === "ready" && sessions.length > 0 ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-[13px]">
            <caption className="sr-only">
              Active sessions for this account, with the device, origin, last use and expiry
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th
                  scope="col"
                  className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase"
                >
                  Device
                </th>
                <th
                  scope="col"
                  className="w-[11rem] px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase"
                >
                  Origin
                </th>
                <th
                  scope="col"
                  className="w-[9rem] px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase"
                >
                  Last used
                </th>
                <th
                  scope="col"
                  className="w-[9rem] px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase"
                >
                  Expires
                </th>
                <th
                  scope="col"
                  className="w-[8rem] px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase text-right"
                >
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const label = describeDevice(
                  session.deviceName,
                  session.deviceType,
                  session.userAgent,
                );
                return (
                  <tr
                    key={session.id}
                    className="border-b border-line last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="min-w-0 truncate font-medium text-ink"
                          title={session.userAgent ?? label}
                        >
                          {label}
                        </span>
                        {session.current ? (
                          <Badge tone="accent" className="shrink-0">
                            This device
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="mono-data block truncate text-[12.5px] text-ink-muted">
                        {session.ipAddress ?? "Not recorded"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <time
                        dateTime={session.lastUsedAt}
                        title={absoluteStamp(session.lastUsedAt)}
                        className="mono-data text-ink-muted"
                      >
                        {relativeStamp(session.lastUsedAt, now)}
                      </time>
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <time
                        dateTime={session.expiresAt}
                        title={absoluteStamp(session.expiresAt)}
                        className="mono-data text-ink-muted"
                      >
                        {relativeStamp(session.expiresAt, now)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      {session.current ? (
                        <span
                          className="text-[12.5px] text-ink-faint"
                          title="Sign out from the account menu to end this session."
                        >
                          Sign out to end
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setTarget(session)}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onClose={() => {
          if (!pending) setTarget(null);
        }}
        onConfirm={() => void revoke()}
        title="Revoke this session?"
        description={
          target
            ? `This ends the signed in session on ${targetLabel}. That device keeps the wrapped vault key and must sign in again with the master password.`
            : ""
        }
        confirmLabel="Revoke session"
        loading={pending}
      />
    </Panel>
  );
}
