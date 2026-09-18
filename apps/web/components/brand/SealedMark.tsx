import { cn } from "@/components/ui/cn";

/**
 * Sealed, not guarded: an envelope with a closed seam. Deliberately not a
 * padlock, a shield, or anything else that promises protection instead of
 * describing what happened.
 */
export function SealedMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect
        x="1.6"
        y="3.4"
        width="12.8"
        height="9.2"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M2.5 4.3 8 8.4l5.5-4.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.1 12.6h2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
