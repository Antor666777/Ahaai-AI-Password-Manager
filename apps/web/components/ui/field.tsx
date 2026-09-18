"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { IconButton } from "./button";
import { InlineError } from "./feedback";

const CONTROL =
  "w-full rounded-md border border-line bg-surface px-3 text-base text-ink sm:text-sm " +
  "placeholder:text-ink-faint transition-colors hover:border-line-strong " +
  "focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-55";

const CONTROL_ERROR = "border-danger";

function LabelRow({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
      {label}
      {required ? (
        <span className="ms-0.5 text-danger" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

function HintOrError({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: string;
  error?: string | null;
}) {
  if (error) {
    return (
      <span id={`${id}-error`} className="block">
        <InlineError>{error}</InlineError>
      </span>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-[12.5px] text-ink-faint">
        {hint}
      </p>
    );
  }
  return null;
}

export interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string | null;
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** Low-level labelled shell for custom controls. */
export function Field({
  label,
  hint,
  error,
  id,
  className,
  children,
}: FieldShellProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className={cn("space-y-1.5", className)}>
      <LabelRow htmlFor={fieldId} label={label} />
      {children}
      <HintOrError id={fieldId} hint={hint} error={error} />
    </div>
  );
}

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export const TextInput = forwardRef<
  HTMLInputElement,
  FieldShellProps & NativeProps
>(function TextInput(
  { label, hint, error, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error
    ? `${fieldId}-error`
    : hint
      ? `${fieldId}-hint`
      : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <LabelRow htmlFor={fieldId} label={label} required={rest.required} />
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL, "h-10", error && CONTROL_ERROR)}
        {...rest}
      />
      <HintOrError id={fieldId} hint={hint} error={error} />
    </div>
  );
});

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  FieldShellProps & TextareaProps
>(function TextArea({ label, hint, error, id, className, ...rest }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error
    ? `${fieldId}-error`
    : hint
      ? `${fieldId}-hint`
      : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <LabelRow htmlFor={fieldId} label={label} required={rest.required} />
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL, "min-h-24 py-2 leading-relaxed", error && CONTROL_ERROR)}
        {...rest}
      />
      <HintOrError id={fieldId} hint={hint} error={error} />
    </div>
  );
});

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">;

export const SelectField = forwardRef<
  HTMLSelectElement,
  FieldShellProps & SelectProps
>(function SelectField({ label, hint, error, id, className, children, ...rest }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error
    ? `${fieldId}-error`
    : hint
      ? `${fieldId}-hint`
      : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <LabelRow htmlFor={fieldId} label={label} required={rest.required} />
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(CONTROL, "h-10 pe-8", error && CONTROL_ERROR)}
        {...rest}
      >
        {children}
      </select>
      <HintOrError id={fieldId} hint={hint} error={error} />
    </div>
  );
});

export interface PasswordFieldProps extends FieldShellProps {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  onBlur?: () => void;
  autoFocus?: boolean;
  action?: ReactNode;
}

/** Password input with a reveal toggle. Never a placeholder-only label. */
export function PasswordField({
  label,
  hint,
  error,
  id,
  className,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
  disabled,
  name,
  onBlur,
  autoFocus,
  action,
}: PasswordFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [revealed, setRevealed] = useState(false);
  const describedBy = error
    ? `${fieldId}-error`
    : hint
      ? `${fieldId}-hint`
      : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <LabelRow htmlFor={fieldId} label={label} />
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL,
            "mono-data h-10 pe-20",
            error && CONTROL_ERROR,
          )}
        />
        <div className="absolute inset-y-0 end-1 flex items-center gap-0.5">
          {action}
          <IconButton
            label={revealed ? "Hide value" : "Show value"}
            size="sm"
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? (
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path
                  d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="10" cy="10" r="2.2" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path
                  d="M3 3l14 14M8.5 5.3A7.7 7.7 0 0 1 10 5c5 0 8 5 8 5a15 15 0 0 1-2.6 3.2M6 7.1A15 15 0 0 0 2 10s3 5 8 5c1 0 1.9-.2 2.7-.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </IconButton>
        </div>
      </div>
      <HintOrError id={fieldId} hint={hint} error={error} />
    </div>
  );
}
