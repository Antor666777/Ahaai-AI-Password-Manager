import type { BadgeTone } from "@/components/ui/feedback";
import type { HealthStatus } from "@/lib/client/health";

export interface StatusMeta {
  /** Short word shown on a badge; colour is never the only cue. */
  label: string;
  tone: BadgeTone;
  /** Group heading in the issue list. */
  heading: string;
  description: string;
}

/** Display order: most urgent first. */
export const STATUS_ORDER: readonly HealthStatus[] = [
  "breached",
  "reused",
  "weak",
  "stale",
];

export const STATUS_META: Record<HealthStatus, StatusMeta> = {
  breached: {
    label: "Breached",
    tone: "danger",
    heading: "Found in a breach",
    description:
      "These passwords appear in a public data breach. Change them first, starting with the most sensitive account.",
  },
  reused: {
    label: "Reused",
    tone: "warning",
    heading: "Reused across accounts",
    description:
      "One leaked copy exposes every account that shares the same password.",
  },
  weak: {
    label: "Weak",
    tone: "warning",
    heading: "Weak passwords",
    description:
      "Under 12 characters, or built from a single type of character, so they are quick to guess.",
  },
  stale: {
    label: "Stale",
    tone: "neutral",
    heading: "Unchanged for months",
    description:
      "Untouched for more than six months. Rotate them when the account allows it.",
  },
};
