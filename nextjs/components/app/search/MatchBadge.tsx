"use client";

import { Badge } from "@/components/ui/feedback";
import { SparkIcon } from "@/components/app/shell/Icons";

/**
 * Verdigris is the "a model ranked this" signal, so it belongs on the badge
 * that says why the row is in the list at all.
 */
export function MatchBadge({ reason }: { reason?: string }) {
  return (
    <Badge tone="accent" className="shrink-0" >
      <SparkIcon className="size-3" />
      <span title={reason}>AI match</span>
    </Badge>
  );
}
