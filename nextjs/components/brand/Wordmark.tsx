import { cn } from "@/components/ui/cn";

/** The wordmark. The only place Fraunces carries a control-adjacent label. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[17px] leading-none font-semibold tracking-tight text-ink",
        className,
      )}
    >
      Ahaai
    </span>
  );
}
