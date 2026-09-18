"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   The sweep is kicked off after the vault is decrypted and the key is in
   memory. Every setState here lands after awaited hashing and a possible range
   fetch resolve, which is the intended client-side data loading pattern; it is
   not a synchronous cascading render. */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, Skeleton } from "@/components/ui/feedback";
import { HealthIcon, RefreshIcon } from "@/components/app/shell/Icons";
import { HealthIssueList } from "@/components/app/health/HealthIssueList";
import { HealthSummary } from "@/components/app/health/HealthSummary";
import { analyzeVault, type HealthReport } from "@/lib/client/health";
import { useVault } from "@/lib/client/vault";

type LoadState = "loading" | "ready" | "error";

function HealthFallback() {
  return (
    <div className="space-y-6">
      <div role="status" className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <span className="sr-only">Checking your passwords</span>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-2.5 w-full" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function HealthPage() {
  const vault = useVault();
  const [state, setState] = useState<LoadState>("loading");
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sweep = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await analyzeVault(vault.items);
      if (result.ok) {
        setReport(result);
        setState("ready");
      } else {
        setError(result.error);
        setState("error");
      }
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.length > 0
          ? caught.message
          : "Could not check your passwords. Try again in a moment.",
      );
      setState("error");
    }
  }, [vault.items]);

  useEffect(() => {
    // Wait for the first decrypt so the sweep never runs against an empty list
    // that is still loading.
    if (vault.loading && vault.items.length === 0) return;
    void sweep();
  }, [sweep, vault.loading, vault.items.length]);

  const flagged = report?.entries.filter((entry) => entry.statuses.length > 0) ?? [];

  return (
    <div className="space-y-9">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">Password health</h1>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-muted">
          Ahaai hashes each saved login in this browser and checks it against
          known breaches. Only the first five characters of the hash ever leave
          your device.
        </p>
      </header>

      {state === "loading" && !report ? <HealthFallback /> : null}

      {state === "error" ? (
        <div className="space-y-3">
          <Callout tone="danger" title="The breach check did not finish">
            <p>{error}</p>
          </Callout>
          <Button
            onClick={() => {
              void sweep();
            }}
          >
            <RefreshIcon className="size-4" />
            Try again
          </Button>
        </div>
      ) : null}

      {report && state !== "error" ? (
        report.summary.total === 0 ? (
          <EmptyState
            icon={<HealthIcon className="size-5" />}
            title="No passwords to check"
            description="Health checks cover login items that have a saved password. Add one and come back."
          />
        ) : (
          <div className="space-y-6">
            <HealthSummary summary={report.summary} />

            {flagged.length === 0 ? (
              <Callout tone="neutral" title="Nothing to fix">
                Every saved password is unique, strong enough and absent from
                the breach lists. Keep new items in this shape.
              </Callout>
            ) : (
              <HealthIssueList entries={report.entries} />
            )}

            <div>
              <Button
                loading={state === "loading"}
                onClick={() => {
                  void sweep();
                }}
              >
                <RefreshIcon className="size-4" />
                Recheck
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
