"use client";

import { Badge } from "@/components/ui/feedback";
import { SparkIcon } from "@/components/app/shell/Icons";
import type { MatchConfidence } from "@/lib/client/types";

/**
 * Verdigris is the "a model ranked this" signal, so it belongs on the badge
 * that says why the row is in the list at all. Only a decision model reports a
 * probability, so only its results ever read as a strong match; a language
 * model's self-assessed score is not calibrated enough to claim that.
 */
export function MatchBadge({
  reason,
  confidence = "possible",
}: {
  reason?: string;
  confidence?: MatchConfidence;
}) {
  return (
    <Badge tone="accent" className="shrink-0" >
      <SparkIcon className="size-3" />
      <span title={reason}>
        {confidence === "strong" ? "Strong match" : "AI match"}
      </span>
    </Badge>
  );
}
