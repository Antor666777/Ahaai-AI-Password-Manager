import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface IconProps {
  className?: string;
}

/** Every glyph shares one frame so strokes line up across the shell. */
function Glyph({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function VaultIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3.2" y="4.2" width="13.6" height="11.6" rx="1.8" {...STROKE} />
      <circle cx="10" cy="10" r="2.5" {...STROKE} />
      <path d="M10 7.5V6.2M10 13.8v-1.3" {...STROKE} />
    </Glyph>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M10 3.2l5.6 2v4.6c0 3.3-2.4 5.4-5.6 6.5-3.2-1.1-5.6-3.2-5.6-6.5V5.2l5.6-2Z"
        {...STROKE}
      />
    </Glyph>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4.2 6.2h11.6M4.2 10h11.6M4.2 13.8h11.6" {...STROKE} />
      <circle cx="8" cy="6.2" r="1.5" {...STROKE} />
      <circle cx="12.4" cy="10" r="1.5" {...STROKE} />
      <circle cx="7.2" cy="13.8" r="1.5" {...STROKE} />
    </Glyph>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M4.2 6h11.6M8.2 6V4.4h3.6V6M5.7 6l.6 9.1a1.3 1.3 0 0 0 1.3 1.2h4.8a1.3 1.3 0 0 0 1.3-1.2L14.3 6"
        {...STROKE}
      />
    </Glyph>
  );
}

export function StarIcon({
  className,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <Glyph className={className}>
      <path
        d="M10 3.3l2 4 4.4.6-3.2 3.1.8 4.4L10 13.4l-4 2 .8-4.4L3.6 7.9 8 7.3l2-4Z"
        fill={filled ? "currentColor" : "none"}
        {...STROKE}
      />
    </Glyph>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4.2 6h11.6M4.2 10h11.6M4.2 14h11.6" {...STROKE} />
    </Glyph>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M5.2 5.2l9.6 9.6M14.8 5.2l-9.6 9.6" {...STROKE} />
    </Glyph>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M10 4.6v10.8M4.6 10h10.8" {...STROKE} />
    </Glyph>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="9" r="4.8" {...STROKE} />
      <path d="M12.6 12.6l3.8 3.8" {...STROKE} />
    </Glyph>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="4.4" y="8.8" width="11.2" height="7.8" rx="1.6" {...STROKE} />
      <path d="M7 8.8V6.6a3 3 0 0 1 6 0v2.2" {...STROKE} />
    </Glyph>
  );
}

export function SignOutIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M12.4 6.4V5a1.4 1.4 0 0 0-1.4-1.4H5.6A1.4 1.4 0 0 0 4.2 5v10a1.4 1.4 0 0 0 1.4 1.4H11a1.4 1.4 0 0 0 1.4-1.4v-1.4M8.8 10h7.4M13.6 7.4 16.2 10l-2.6 2.6"
        {...STROKE}
      />
    </Glyph>
  );
}

export function KeyIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="7" cy="13" r="2.6" {...STROKE} />
      <path d="M8.9 11.1 15.4 4.6M13.4 4.6h2.6v2.6M12 6.2l1.6 1.6" {...STROKE} />
    </Glyph>
  );
}

export function CardIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <rect x="3" y="5" width="14" height="10" rx="1.6" {...STROKE} />
      <path d="M3 8.4h14M6 11.8h3.4" {...STROKE} />
    </Glyph>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="10" cy="7.4" r="2.8" {...STROKE} />
      <path d="M4.9 16.2a5.1 5.1 0 0 1 10.2 0" {...STROKE} />
    </Glyph>
  );
}

export function NoteIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M6 3.6h5.6l3.8 3.8v9a1.4 1.4 0 0 1-1.4 1.4H6a1.4 1.4 0 0 1-1.4-1.4V5A1.4 1.4 0 0 1 6 3.6Z"
        {...STROKE}
      />
      <path d="M11.4 3.6v3.8h4M7.2 11h5.6M7.2 13.8h3.4" {...STROKE} />
    </Glyph>
  );
}

export function FolderIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M3.4 6.2A1.4 1.4 0 0 1 4.8 4.8h3l1.4 1.6h6a1.4 1.4 0 0 1 1.4 1.4v5.8a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4V6.2Z"
        {...STROKE}
      />
    </Glyph>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="10" cy="10" r="3.4" {...STROKE} />
      <path
        d="M10 2.4v1.8M10 15.8v1.8M2.4 10h1.8M15.8 10h1.8M4.6 4.6l1.3 1.3M14.1 14.1l1.3 1.3M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3"
        {...STROKE}
      />
    </Glyph>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M16.2 12.4A6.6 6.6 0 0 1 7.6 3.8a6.8 6.8 0 1 0 8.6 8.6Z" {...STROKE} />
    </Glyph>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M10 3.4l1.4 4.1 4.1 1.4-4.1 1.4L10 14.4l-1.4-4.1L4.5 8.9l4.1-1.4L10 3.4Z"
        {...STROKE}
      />
    </Glyph>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12.4 4.8 7.2 10l5.2 5.2" {...STROKE} />
    </Glyph>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M16 10a6 6 0 1 1-1.9-4.4" {...STROKE} />
      <path d="M16.2 4.2v3.6h-3.6" {...STROKE} />
    </Glyph>
  );
}

export function HealthIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M2.2 10h3.1l1.8-3.5 2.4 7 1.8-3.5h5.5" {...STROKE} />
    </Glyph>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M2.2 10S5.2 5.6 10 5.6 17.8 10 17.8 10 14.8 14.4 10 14.4 2.2 10 2.2 10Z" {...STROKE} />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </Glyph>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M3 3l14 14" {...STROKE} />
      <path
        d="M8.6 5.9A7.7 7.7 0 0 1 10 5.8c4.8 0 7.8 4.4 7.8 4.4a15 15 0 0 1-2.5 2.8M5.9 7.5A15 15 0 0 0 2.2 10.2s3 4.4 7.8 4.4c.9 0 1.7-.2 2.4-.5"
        {...STROKE}
      />
    </Glyph>
  );
}
