"use client";

import { useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { CopyButton, MonoValue } from "@/components/ui/data";
import { EyeIcon, EyeOffIcon } from "@/components/app/shell/Icons";

const DOT = "\u2022";

/** A fixed-length mask keeps the row from leaking the secret's length. */
function mask(value: string): string {
  const length = Math.min(14, Math.max(6, value.length));
  return DOT.repeat(length);
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

/** Secrets are masked by default, revealed on request, and copyable either way. */
export function SecretRow({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <MonoValue value={revealed ? value : mask(value)} />
        </span>
        <IconButton
          label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          size="sm"
          onClick={() => setRevealed((current) => !current)}
          className="min-h-11 min-w-11"
        >
          {revealed ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </IconButton>
        <CopyButton
          value={value}
          label={`Copy ${label.toLowerCase()}`}
          className="min-h-11 min-w-11"
        />
      </div>
    </FieldRow>
  );
}
