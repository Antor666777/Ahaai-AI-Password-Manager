"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { TextInput } from "@/components/ui/field";
import type { AiMode } from "@/lib/client/types";

export interface SearchBarProps {
  value: string;
  aiMode: AiMode | null;
  searching: boolean;
  /** True once a query has produced results or an error worth clearing. */
  hasResults: boolean;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  onClear: () => void;
}

export function SearchBar({
  value,
  aiMode,
  searching,
  hasResults,
  onChange,
  onSubmit,
  onClear,
}: SearchBarProps) {
  const [emptyError, setEmptyError] = useState<string | null>(null);
  const inputId = useId();
  const isLocal = aiMode === "local";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;
    if (value.trim().length === 0) {
      setEmptyError(
        "Type a few words about what you are looking for, then search.",
      );
      document.getElementById(inputId)?.focus();
      return;
    }
    setEmptyError(null);
    onSubmit(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextInput
            id={inputId}
            label="Search the vault"
            name="vault-search"
            type="search"
            value={value}
            disabled={searching}
            spellCheck={false}
            autoComplete="off"
            placeholder="The login I use for the water bill"
            error={emptyError}
            hint="Describe it in your own words. Ahaai ranks matches without reading the credentials."
            onChange={(event) => {
              onChange(event.target.value);
              if (emptyError) setEmptyError(null);
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={searching}>
            Search
          </Button>
          {hasResults ? (
            <Button onClick={onClear} disabled={searching}>
              Clear search
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={isLocal ? "accent" : "neutral"}>
          {isLocal ? "Local model" : "Cloud model"}
        </Badge>
        <p className="text-[12.5px] text-ink-faint">
          {isLocal
            ? "Matches are ranked on your own machine, so nothing leaves it."
            : "Only minted tokens reach the provider. Usernames and passwords never do."}
        </p>
      </div>
    </form>
  );
}
