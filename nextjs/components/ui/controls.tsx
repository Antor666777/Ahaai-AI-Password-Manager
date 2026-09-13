"use client";

import { useId } from "react";
import { cn } from "./cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/** A switch is labelled for what happens when it is on. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: SwitchProps) {
  const auto = useId();
  const fieldId = id ?? auto;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={fieldId} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-faint">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={fieldId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative flex h-6 w-10 shrink-0 items-center rounded-full border px-0.5 transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-55",
          checked
            ? "justify-end border-primary bg-primary"
            : "justify-start border-line-strong bg-surface-2",
        )}
      >
        <span className="size-4 rounded-full bg-paper shadow-[var(--shadow-1)]" />
      </button>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Native radios, so arrow keys move between options and the group is announced
 * correctly. Focus is drawn on the label via :has().
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  name,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  const auto = useId();
  const groupName = name ?? auto;

  return (
    <fieldset
      disabled={disabled}
      className={cn(
        "inline-flex rounded-md border border-line bg-surface-2 p-0.5",
        "disabled:opacity-55",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-sm px-3 text-[13px] font-medium transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
              selected
                ? "bg-surface text-ink shadow-[var(--shadow-1)]"
                : "text-ink-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
