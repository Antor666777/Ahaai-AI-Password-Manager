"use client";

import { Skeleton, Spinner } from "@/components/ui/feedback";

export interface AuthNoticeProps {
  /** `checking` while the session is looked up, `authenticated` once it lands. */
  state: "checking" | "authenticated";
}

/**
 * The panel's two non-form states. Both say what is happening and what to do
 * if it does not.
 */
export function AuthNotice({ state }: AuthNoticeProps) {
  if (state === "checking") {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">Looking for a session in this browser.</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  return (
    <div role="status" className="animate-fade space-y-4">
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-muted">
        <Spinner className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <span>
          This browser already holds a signed in session, so opening your vault
          now. Nothing was typed here, so nothing was sent.
        </span>
      </p>
      <a
        href="/vault"
        className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
      >
        Open the vault
      </a>
      <p className="text-[12.5px] text-ink-faint">
        If the vault does not open on its own, follow the link above.
      </p>
    </div>
  );
}
