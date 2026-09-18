"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/feedback";
import { Panel, PanelHeader } from "@/components/ui/data";
import type { HealthEntry, HealthStatus } from "@/lib/client/health";
import { WEAK_LENGTH } from "@/lib/client/health";
import { STATUS_META, STATUS_ORDER } from "./meta";

/** The plain-language reason an item appears under a given status heading. */
function reasonFor(entry: HealthEntry, status: HealthStatus): string {
  switch (status) {
    case "breached":
      return entry.breachCount === 1
        ? "Seen in 1 breach record"
        : `Seen in ${entry.breachCount.toLocaleString()} breach records`;
    case "reused": {
      const others = entry.reuseCount - 1;
      return others === 1
        ? "Shared with 1 other item"
        : `Shared with ${others} other items`;
    }
    case "weak": {
      const reasons: string[] = [];
      if (entry.passwordLength < WEAK_LENGTH) {
        reasons.push(`${entry.passwordLength} characters`);
      }
      if (entry.characterClasses <= 1) reasons.push("one type of character");
      return reasons.join(", ");
    }
    case "stale":
      return `Unchanged for ${entry.ageDays.toLocaleString()} days`;
  }
}

function byName(a: HealthEntry, b: HealthEntry): number {
  return a.item.name.localeCompare(b.item.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function IssueRow({ entry, status }: { entry: HealthEntry; status: HealthStatus }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link
        href={`/vault?item=${encodeURIComponent(entry.item.id)}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-[13px] transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-ink">
          {entry.item.name || "Untitled item"}
        </span>
        <span className="text-[12.5px] text-ink-muted">
          {reasonFor(entry, status)}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {entry.statuses.map((entryStatus) => (
            <Badge key={entryStatus} tone={STATUS_META[entryStatus].tone}>
              {STATUS_META[entryStatus].label}
            </Badge>
          ))}
        </span>
      </Link>
    </li>
  );
}

/**
 * Flagged items grouped by status. An item can carry more than one status, so
 * it can appear in more than one group; the badges on each row spell out every
 * reason at a glance.
 */
export function HealthIssueList({ entries }: { entries: HealthEntry[] }) {
  return (
    <div className="space-y-6">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const group = entries
          .filter((entry) => entry.statuses.includes(status))
          .sort(byName);
        if (group.length === 0) return null;

        return (
          <Panel key={status}>
            <PanelHeader
              title={`${meta.heading} (${group.length})`}
              description={meta.description}
            />
            <ul>
              {group.map((entry) => (
                <IssueRow key={entry.item.id} entry={entry} status={status} />
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
