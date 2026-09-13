import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

interface Fact {
  title: string;
  body: ReactNode;
}

const FACTS: Fact[] = [
  {
    title: "Keys derive on your device",
    body: (
      <>
        Argon2id turns your master password into the vault key inside this
        browser. The server keeps a wrapped copy it has no way to open.
      </>
    ),
  },
  {
    title: "Per-request tokens, never ids",
    body: (
      <>
        A search leaves as opaque tokens like{" "}
        <span className="mono-data text-ink-muted">t_7f3a9c2e...</span>, minted
        for that one request. The map back to your rows stays here.
      </>
    ),
  },
  {
    title: "Breach checks by k-anonymity",
    body: (
      <>
        Only the first five characters of a password hash prefix leave the
        device. The suffixes come back with a count, so the check never learns
        the password.
      </>
    ),
  },
];

/**
 * Three facts, separated by rules. No card grid, no icons, nothing we cannot
 * point at in the code.
 */
export function PrivacyStrip({ className }: { className?: string }) {
  return (
    <section
      id="privacy"
      aria-labelledby="ahaai-privacy-heading"
      className={cn("scroll-mt-20", className)}
    >
      <h2
        id="ahaai-privacy-heading"
        className="text-[13px] font-semibold text-ink"
      >
        How it stays private
      </h2>

      <ul className="mt-4 grid gap-4 sm:grid-cols-3 sm:gap-0">
        {FACTS.map((fact, index) => (
          <li
            key={fact.title}
            className={cn(
              "space-y-2",
              index > 0 &&
                "border-t border-line pt-4 sm:border-s sm:border-t-0 sm:pt-0 sm:ps-4",
              index === 0 && "sm:pe-4",
            )}
          >
            <h3 className="text-[13px] font-medium text-ink">{fact.title}</h3>
            <p className="max-w-[38ch] text-[13px] leading-relaxed text-ink-muted">
              {fact.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
