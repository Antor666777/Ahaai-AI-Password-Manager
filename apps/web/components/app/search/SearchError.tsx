"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

export type SearchErrorKind = "provider" | "upstream" | "rate" | "generic";

interface Copy {
  title: string;
  body: string;
}

const COPY: Record<SearchErrorKind, Copy> = {
  provider: {
    title: "This search has no provider it can use",
    body: "A search runs on one provider. Add one for the selected mode in settings, then search again.",
  },
  upstream: {
    title: "The provider could not finish the search",
    body: "The request reached the provider but no usable answer came back. Check the provider in settings, then search again.",
  },
  rate: {
    title: "Too many searches just now",
    body: "Ahaai limits how often one vault can be searched. Wait a moment, then search again.",
  },
  generic: {
    title: "The search did not finish",
    body: "Something interrupted the request. Try again, and if it keeps failing, check the provider in settings.",
  },
};

export interface SearchErrorProps {
  kind: SearchErrorKind;
  detail: string | null;
  retrying: boolean;
  onRetry: () => void;
  /** One-click way out when the mode and the available providers disagree. */
  switchLabel?: string;
  onSwitchMode?: () => void;
}

/** A recoverable dead end: what broke, plus the ways forward. */
export function SearchError({
  kind,
  detail,
  retrying,
  onRetry,
  switchLabel,
  onSwitchMode,
}: SearchErrorProps) {
  const copy = COPY[kind];
  // A provider failure already carries a precise reason from the server, so it
  // becomes the message instead of a template.
  const body = kind === "provider" && detail ? detail : copy.body;
  const mutedDetail = kind === "provider" ? null : detail;

  return (
    <div className="px-3 py-3">
      <Callout tone={kind === "rate" ? "warning" : "danger"} title={copy.title}>
        <p>{body}</p>
        {mutedDetail ? (
          <p className="mono-data mt-1.5 text-[12px] text-ink-faint">
            {mutedDetail}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onSwitchMode && switchLabel ? (
            <Button size="sm" variant="primary" onClick={onSwitchMode}>
              {switchLabel}
            </Button>
          ) : null}
          <Button size="sm" onClick={onRetry} loading={retrying}>
            Search again
          </Button>
          {kind === "provider" || kind === "upstream" || kind === "generic" ? (
            <Link
              href="/vault/settings"
              className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Open AI settings
            </Link>
          ) : null}
        </div>
      </Callout>
    </div>
  );
}
