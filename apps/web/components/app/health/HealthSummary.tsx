"use client";

import { Panel, PanelHeader } from "@/components/ui/data";
import { Badge, type BadgeTone } from "@/components/ui/feedback";
import { cn } from "@/components/ui/cn";
import type { HealthSummary as SummaryData } from "@/lib/client/health";
import { STATUS_META, STATUS_ORDER } from "./meta";

/** The score is always paired with a word, so colour alone is never the cue. */
function scoreBand(score: number): { label: string; tone: BadgeTone; bar: string } {
  if (score >= 90) return { label: "Excellent", tone: "success", bar: "bg-success" };
  if (score >= 75) return { label: "Good", tone: "success", bar: "bg-success" };
  if (score >= 50) return { label: "Needs attention", tone: "warning", bar: "bg-warning" };
  return { label: "At risk", tone: "danger", bar: "bg-danger" };
}

function plural(value: number, word: string): string {
  return value === 1 ? `1 ${word}` : `${value} ${word}s`;
}

export function HealthSummary({ summary }: { summary: SummaryData }) {
  const band = scoreBand(summary.score);
  const needsAttention = summary.total - summary.healthy;

  return (
    <Panel>
      <PanelHeader
        title="Password health"
        description={
          summary.total === 0
            ? "No saved logins to score yet."
            : `${plural(summary.total, "login")} checked · ${needsAttention} ${
                needsAttention === 1 ? "needs" : "need"
              } attention.`
        }
      />

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="min-w-[5rem]">
            <p className="flex items-baseline gap-0.5">
              <span className="text-[32px] font-semibold leading-none tabular-nums text-ink">
                {summary.score}
              </span>
              <span className="text-[13px] text-ink-faint">/100</span>
            </p>
            <p className="mt-1 text-[12px] text-ink-faint">Health score</p>
          </div>

          <div className="min-w-[12rem] flex-1">
            <div
              className="h-2 overflow-hidden rounded-full bg-surface-3"
              aria-hidden="true"
            >
              <span
                className={cn("block h-full rounded-full", band.bar)}
                style={{ width: `${summary.score}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={band.tone}>{band.label}</Badge>
              <span className="text-[12.5px] text-ink-muted">
                {needsAttention === 0
                  ? "Every password is clean"
                  : "Lower the count of flagged items to raise this"}
              </span>
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            return (
              <li
                key={status}
                className="rounded-lg border border-line bg-surface-2 px-3 py-2.5"
              >
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <p className="mt-1.5 text-[20px] font-semibold leading-none tabular-nums text-ink">
                  {summary[status]}
                </p>
              </li>
            );
          })}
          <li className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <Badge tone="success">Healthy</Badge>
            <p className="mt-1.5 text-[20px] font-semibold leading-none tabular-nums text-ink">
              {summary.healthy}
            </p>
          </li>
        </ul>
      </div>
    </Panel>
  );
}
