"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { CopyButton, MonoValue } from "@/components/ui/data";
import { useSession } from "@/lib/client/session";
import { EyeIcon, EyeOffIcon } from "@/components/app/shell/Icons";
import { RepromptDialog } from "./RepromptDialog";

const DOT = "\u2022";

/** How long a revealed secret may sit on screen before it masks itself. */
const REVEAL_TTL_MS = 30_000;

/** A fixed-length mask keeps the row from leaking the secret's length. */
export function maskSecret(value: string): string {
  const length = Math.min(14, Math.max(6, value.length));
  return DOT.repeat(length);
}

/**
 * Shared gate for a row that shows a secret. A reprompt row stays locked until
 * the master password has been confirmed, whether that happened just now in the
 * dialog or inside the session's short grace window. A non-reprompt row is
 * always open, so callers can use the same hook for every secret.
 */
export function useRepromptGate(reprompt: boolean) {
  const session = useSession();
  const [promptOpen, setPromptOpen] = useState(false);

  return {
    unlocked: !reprompt || session.hasRepromptAccess(),
    promptOpen,
    openPrompt: () => setPromptOpen(true),
    closePrompt: () => setPromptOpen(false),
  };
}

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <p className="text-[12.5px] text-ink-faint">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SingleLine({ value, mono }: { value: string; mono: boolean }) {
  if (mono) return <MonoValue value={value} />;
  return (
    <span className="block truncate text-[13px] text-ink" title={value}>
      {value}
    </span>
  );
}

export function ValueRow({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <FieldRow label={label}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {multiline ? (
            <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap text-ink">
              {value}
            </p>
          ) : (
            <SingleLine value={value} mono={mono} />
          )}
        </div>
        <CopyButton
          value={value}
          label={`Copy ${label.toLowerCase()}`}
          className="min-h-11 min-w-11"
        />
      </div>
    </FieldRow>
  );
}

/**
 * Secrets are masked by default, revealed on request, and copyable either way,
 * except on a reprompt item: there the reveal (and the copy control) waits for
 * the master password, and a reveal masks itself again after a short while so a
 * secret cannot be left on screen for as long as the row stays mounted.
 */
export function SecretRow({
  label,
  value,
  reprompt = false,
}: {
  label: string;
  value: string;
  reprompt?: boolean;
}) {
  const gate = useRepromptGate(reprompt);
  const [revealed, setRevealed] = useState(false);

  // Restart the countdown on every reveal and on every value change, and clear
  // it on unmount so a closed panel cannot leave a timer ticking.
  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setRevealed(false), REVEAL_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed, value]);

  function toggle() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (!gate.unlocked) {
      gate.openPrompt();
      return;
    }
    setRevealed(true);
  }

  const showLabel = revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`;

  return (
    <>
      <FieldRow label={label}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <MonoValue value={revealed ? value : maskSecret(value)} />
          </span>
          <IconButton
            label={showLabel}
            size="sm"
            onClick={toggle}
            className="min-h-11 min-w-11"
          >
            {revealed ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </IconButton>
          {/* While the gate is locked the copy control would hand over the
              secret without the master password, so it waits with the reveal. */}
          {gate.unlocked ? (
            <CopyButton
              value={value}
              label={`Copy ${label.toLowerCase()}`}
              className="min-h-11 min-w-11"
            />
          ) : null}
        </div>
      </FieldRow>

      {gate.promptOpen ? (
        <RepromptDialog
          open
          onClose={gate.closePrompt}
          onVerified={() => {
            gate.closePrompt();
            setRevealed(true);
          }}
        />
      ) : null}
    </>
  );
}
