"use client";

import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/feedback";
import { SealedMark } from "./SealedMark";

/** What the person typed. The vault is the only place this resolves. */
const QUERY = "my duolingo alt";

/**
 * A real AES-256-GCM envelope: `v1.<base64 nonce>.<base64 ciphertext+tag>`.
 * This is the shape the vault stores, so the artifact shows the shape.
 */
const SEALED_SECRET =
  "v1.kQ7mZ2xT9pLf.n8Vb3dQeR1sTkZ4hGw2xLpQy6mDc9FrJt5Ua7Eo0BnI";

interface Candidate {
  /** 16 random bytes as base64url, minted per request. Never an item id. */
  token: string;
  title: string;
  domain: string;
  note: string;
  score?: number;
  reason?: string;
}

const CANDIDATES: Candidate[] = [
  {
    token: "t_a90e2c7b5d1f83460b3e82",
    title: "Duolingo, alt",
    domain: "duolingo.com",
    note: "second account for the two week trial",
    score: 0.94,
    reason: "the title names Duolingo and the note says second account",
  },
  {
    token: "t_7f3a9c2e1b8d4a6f0c2e51",
    title: "Duolingo, main",
    domain: "duolingo.com",
    note: "school account, 2fa on",
    score: 0.71,
    reason: "same site, but the note points at the other account",
  },
  {
    token: "t_c41b8e0d3a7f295b6c8d47",
    title: "Youtube for grandpa",
    domain: "youtube.com",
    note: "grandpa tablet, shared with Priya",
  },
];

/** Tokens are shown cut: the full value stays reachable on hover. */
function shortToken(token: string): string {
  return `${token.slice(0, 11)}...`;
}

export function ProofArtifact({ className }: { className?: string }) {
  // Replay remounts the rows so the match can be watched again on demand.
  const [run, setRun] = useState(0);
  const replaying = run > 0;

  return (
    <section
      aria-labelledby="ahaai-artifact-heading"
      className={cn("panel shadow-[var(--shadow-1)]", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4">
        <div>
          <h2
            id="ahaai-artifact-heading"
            className="text-[13px] font-semibold text-ink"
          >
            One search, start to finish
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            The vault holds three rows. You ask for one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="nums text-[12px] text-ink-faint">
            3 candidates, 2 matches
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRun((current) => current + 1)}
          >
            Replay the match
          </Button>
        </div>
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="text-[12.5px] text-ink-faint">You typed</p>
        <p className="mt-1 text-[15px] text-ink">{QUERY}</p>
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="text-[12.5px] text-ink-faint">Sent to the model</p>
          <p className="mono-data text-[12px] text-ink-faint">
            titles and tokens only
          </p>
        </div>
        <ul key={run} className="mt-2 divide-y divide-line">
          {CANDIDATES.map((candidate, index) => (
            <li
              key={candidate.token}
              className={cn(
                "flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5",
                replaying && "animate-rise",
              )}
              style={
                replaying
                  ? ({ animationDelay: `${index * 70}ms` } satisfies CSSProperties)
                  : undefined
              }
            >
              <span
                title={candidate.token}
                className="mono-data w-[6.75rem] shrink-0 truncate text-[12.5px] text-ink-muted sm:w-[7.5rem]"
              >
                {shortToken(candidate.token)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">
                  {candidate.title}
                </p>
                <p className="truncate text-[12px] text-ink-faint">
                  {`${candidate.domain}, ${candidate.note}`}
                </p>
              </div>
              {candidate.score === undefined ? (
                <span className="mono-data text-[12px] text-ink-faint">
                  not matched
                </span>
              ) : (
                <span className="mono-data flex items-center gap-1.5 text-[12px] text-accent">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-accent"
                  />
                  matched {candidate.score.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-[12.5px] text-ink-faint">Returned to your device</p>
          <Badge tone="accent">
            <SealedMark className="size-3.5" />
            Sealed
          </Badge>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          The model ranked{" "}
          <span title="t_a90e2c7b5d1f83460b3e82" className="mono-data text-ink">
            {shortToken(CANDIDATES[0]?.token ?? "")}
          </span>{" "}
          first, because {CANDIDATES[0]?.reason}. The vault mapped that token
          back to <span className="text-ink">Duolingo, alt</span> here and
          handed over the username. The password stayed in its envelope.
        </p>

        <p className="mono-data mt-3 rounded-md bg-surface-2 px-3 py-2 text-[12.5px] break-all text-ink-muted">
          {SEALED_SECRET}
        </p>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          Ahaai found it and never saw it. Only this browser holds the vault key
          that opens that envelope.
        </p>
      </div>
    </section>
  );
}
