"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { Spinner } from "./feedback";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-paper hover:opacity-92",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-55",
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner className="size-4" /> : null}
        {children}
      </button>
    );
  },
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon alone has no accessible name. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "size-8",
  md: "size-10",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, variant = "ghost", size = "md", className, children, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "inline-grid place-items-center rounded-md transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-55",
          VARIANT[variant],
          ICON_SIZE[size],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
