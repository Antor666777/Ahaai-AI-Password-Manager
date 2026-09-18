"use client";

import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/feedback";
import type { SearchOutcome } from "@/lib/client/vault";
import type { DecryptedItem } from "@/lib/client/types";
import { SearchIcon } from "@/components/app/shell/Icons";
import { typeLabel } from "@/components/app/item/meta";
import { TypeGlyph } from "@/components/app/item/TypeGlyph";
import { MatchBadge } from "./MatchBadge";

export interface SearchResultsProps {
  query: string;
  outcome: SearchOutcome;
  onOpen: (item: DecryptedItem) => void;
  onClear: () => void;
}

export function SearchResults({
  query,
  outcome,
  onOpen,
  onClear,
}: SearchResultsProps) {
  const hits = outcome.hits;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-3 py-3">
        <p className="text-[13px] text-ink-muted">
          <span className="font-medium text-ink">
            {hits.length === 1 ? "1 match" : `${hits.length} matches`}
          </span>{" "}
          for &ldquo;{query}&rdquo;
        </p>
        <div className="flex items-center gap-2">
          <p className="mono-data min-w-0 truncate text-[12px] text-ink-faint">
            {outcome.modelId} · {outcome.presetId} · {outcome.candidateCount} items
            sent
          </p>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear search
          </Button>
        </div>
      </div>

      {outcome.truncated ? (
        <div className="px-3 pt-3">
          <Callout tone="warning" title="Part of the vault was not searched">
            This vault is larger than one request can carry, so Ahaai sent the
            first {outcome.candidateCount} items and left the rest out. A
            narrower query or a smaller folder will search the whole set.
          </Callout>
        </div>
      ) : null}

      <ul aria-label="Search results">
        {hits.map((hit, index) => (
          <li key={hit.item.id} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => onOpen(hit.item)}
              className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="mono-data w-4 shrink-0 text-[12px] text-ink-faint">
                {index + 1}
              </span>
              <TypeGlyph type={hit.item.type} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className="min-w-0 truncate text-[14px] font-medium text-ink"
                    title={hit.item.name}
                  >
                    {hit.item.name}
                  </span>
                  <MatchBadge reason={hit.reason} />
                </span>
                <span
                  className="mt-0.5 block truncate text-[12.5px] text-ink-muted"
                  title={hit.reason}
                >
                  {hit.reason}
                  <span aria-hidden="true"> · </span>
                  {typeLabel(hit.item.type)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NoSearchResults({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      icon={<SearchIcon className="size-5" />}
      title="No item matched that description"
      description={`Nothing in the vault fit “${query}”. Try a site name, a person, or what you use the login for, or clear the search and browse the list instead.`}
      action={<Button onClick={onClear}>Clear search</Button>}
    />
  );
}
