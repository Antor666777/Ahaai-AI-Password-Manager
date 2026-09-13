"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Callout, Skeleton, Spinner } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { useVault, type SearchOutcome } from "@/lib/client/vault";
import type { AiMode, DecryptedItem } from "@/lib/client/types";
import { PlusIcon, RefreshIcon } from "@/components/app/shell/Icons";
import { isItemType } from "@/components/app/item/meta";
import { ItemEditor } from "@/components/app/item/ItemEditor";
import { ItemInspector } from "@/components/app/item/ItemInspector";
import { SearchBar } from "@/components/app/search/SearchBar";
import {
  NoSearchResults,
  SearchResults,
} from "@/components/app/search/SearchResults";
import {
  SearchError,
  type SearchErrorKind,
} from "@/components/app/search/SearchError";
import { FilterBar } from "@/components/app/vault/FilterBar";
import { ItemList } from "@/components/app/vault/ItemList";
import {
  EmptyVault,
  ItemListSkeleton,
  NoFilterMatches,
} from "@/components/app/vault/VaultStates";
import { UndoBar } from "@/components/app/vault/UndoBar";

interface SearchFailure {
  kind: SearchErrorKind;
  detail: string | null;
  /** Set when the mode and the available providers disagree. */
  alternativeMode: AiMode | null;
}

function describeSearchError(caught: unknown): SearchFailure {
  const detail = caught instanceof Error ? caught.message : null;
  const code = caught instanceof ApiError ? caught.code : null;
  const details =
    caught instanceof ApiError
      ? (caught.details as
          | { reason?: string; alternativeMode?: AiMode }
          | undefined)
      : undefined;
  const alternativeMode =
    details?.reason === "no_matching_provider"
      ? (details.alternativeMode ?? null)
      : null;

  if (code === "BAD_REQUEST") {
    return { kind: "provider", detail, alternativeMode };
  }
  if (code === "UPSTREAM") {
    return { kind: "upstream", detail, alternativeMode: null };
  }
  if (code === "RATE_LIMITED") {
    return { kind: "rate", detail, alternativeMode: null };
  }
  return { kind: "generic", detail, alternativeMode: null };
}

function failureMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

/** Name first, then id, so the order never drifts between renders. */
function compareItems(a: DecryptedItem, b: DecryptedItem): number {
  const byName = a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

export default function VaultPage() {
  // The filters live in the URL, so reading them has to sit behind Suspense.
  return (
    <Suspense fallback={<VaultFallback />}>
      <VaultWorkspace />
    </Suspense>
  );
}

function VaultFallback() {
  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 lg:px-9">
      <div role="status" className="space-y-4">
        <span className="sr-only">Loading the vault</span>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-full" />
        <div className="rounded-lg border border-line bg-surface p-3">
          <ItemListSkeleton />
        </div>
      </div>
    </div>
  );
}

function VaultWorkspace() {
  const vault = useVault();
  const { settings, setSettings } = useSession();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const typeParam = searchParams.get("type");
  const typeFilter = isItemType(typeParam) ? typeParam : "";
  const favoritesOnly = searchParams.get("favorites") === "1";

  // A folder id that no longer exists would desync the select, so it drops out.
  const folderFilter = useMemo(() => {
    const raw = searchParams.get("folder") ?? "";
    if (raw === "" || raw === "none") return raw;
    return vault.folders.some((folder) => folder.id === raw) ? raw : "";
  }, [searchParams, vault.folders]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [lastTrashed, setLastTrashed] = useState<DecryptedItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [editor, setEditor] = useState<{ item: DecryptedItem | null } | null>(
    null,
  );

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [searching, setSearching] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [searchError, setSearchError] = useState<SearchFailure | null>(null);
  const searchToken = useRef(0);

  useEffect(() => {
    if (!lastTrashed) return;
    const timer = window.setTimeout(() => setLastTrashed(null), 8000);
    return () => window.clearTimeout(timer);
  }, [lastTrashed]);

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of vault.folders) map.set(folder.id, folder.name);
    return map;
  }, [vault.folders]);

  const folderNameOf = useCallback(
    (folderId: string | null): string | null => {
      if (!folderId) return null;
      return folderNames.get(folderId) ?? null;
    },
    [folderNames],
  );

  const visibleItems = useMemo(() => {
    const filtered = vault.items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (folderFilter === "none") {
        if (item.folderId !== null) return false;
      } else if (folderFilter && item.folderId !== folderFilter) {
        return false;
      }
      if (favoritesOnly && !item.favorite) return false;
      return true;
    });
    return filtered.sort(compareItems);
  }, [vault.items, typeFilter, folderFilter, favoritesOnly]);

  const selectedItem = useMemo(
    () => vault.items.find((item) => item.id === selectedId) ?? null,
    [vault.items, selectedId],
  );

  const searchActive = submitted.length > 0;

  function applyParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }

  async function runSearch(term: string, modeOverride?: AiMode) {
    const token = searchToken.current + 1;
    searchToken.current = token;
    setSearching(true);
    setSubmitted(term);
    setOutcome(null);
    setSearchError(null);
    try {
      const result = await vault.search(term, { mode: modeOverride });
      if (searchToken.current !== token) return;
      setOutcome(result);
    } catch (caught) {
      if (searchToken.current !== token) return;
      setSearchError(describeSearchError(caught));
    } finally {
      if (searchToken.current === token) setSearching(false);
    }
  }

  function clearSearch() {
    searchToken.current += 1;
    setQuery("");
    setSubmitted("");
    setOutcome(null);
    setSearchError(null);
    setSearching(false);
  }

  /** Saves the other mode, then retries the same search with it. */
  async function switchModeAndSearch(mode: AiMode) {
    try {
      const result = await api.updateAiSettings({ aiMode: mode });
      setSettings(result.settings);
      toast.success(
        mode === "local" ? "Searching on this machine" : "Searching with your provider",
        "The saved mode changed, so searches use it from now on.",
      );
      await runSearch(submitted, mode);
    } catch (caught) {
      toast.error(
        "The search mode was not changed",
        failureMessage(caught, "Try again in a moment."),
      );
    }
  }

  async function handleToggleFavorite(item: DecryptedItem) {
    setFavoriteBusyId(item.id);
    try {
      await vault.setFavorite(item.id, !item.favorite);
    } catch (caught) {
      toast.error(
        "Favorite was not changed",
        failureMessage(caught, "Try again in a moment."),
      );
    } finally {
      setFavoriteBusyId(null);
    }
  }

  async function handleTrash(item: DecryptedItem) {
    try {
      await vault.trashItem(item.id);
      setLastTrashed(item);
      if (selectedId === item.id) setSelectedId(null);
    } catch (caught) {
      toast.error(
        "Item was not moved to trash",
        failureMessage(caught, "Try again in a moment."),
      );
    }
  }

  async function handleRestore() {
    if (!lastTrashed) return;
    setRestoring(true);
    try {
      await vault.restoreItem(lastTrashed.id);
      toast.success("Item restored", lastTrashed.name);
      setLastTrashed(null);
    } catch (caught) {
      toast.error(
        "Item was not restored",
        failureMessage(caught, "Try again in a moment."),
      );
    } finally {
      setRestoring(false);
    }
  }

  function renderSearch() {
    if (searching) {
      return (
        <div role="status">
          <div className="flex items-center gap-2 border-b border-line px-3 py-3 text-[13px] text-ink-muted">
            <Spinner className="size-4" />
            Searching the vault
          </div>
          <ItemListSkeleton rows={4} />
        </div>
      );
    }

    if (searchError) {
      return (
        <SearchError
          kind={searchError.kind}
          detail={searchError.detail}
          retrying={false}
          onRetry={() => {
            // The request token is read inside the click handler, not during
            // render; the lint rule cannot see through the render-time helper.
            // eslint-disable-next-line react-hooks/refs
            void runSearch(submitted);
          }}
          switchLabel={
            searchError.alternativeMode === "local"
              ? "Switch search to local"
              : searchError.alternativeMode === "cloud"
                ? "Switch search to cloud"
                : undefined
          }
          onSwitchMode={
            searchError.alternativeMode
              ? () => {
                  const next = searchError.alternativeMode;
                  if (next) void switchModeAndSearch(next);
                }
              : undefined
          }
        />
      );
    }

    if (outcome) {
      if (outcome.hits.length === 0) {
        return <NoSearchResults query={submitted} onClear={clearSearch} />;
      }
      return (
        <SearchResults
          query={submitted}
          outcome={outcome}
          onOpen={(item) => setSelectedId(item.id)}
          onClear={clearSearch}
        />
      );
    }

    return null;
  }

  function renderList() {
    return (
      <>
        <FilterBar
          typeValue={typeFilter}
          folderValue={folderFilter}
          favorites={favoritesOnly}
          count={visibleItems.length}
          folders={vault.folders}
          onTypeChange={(value) => applyParams({ type: value })}
          onFolderChange={(value) => applyParams({ folder: value })}
          onFavoritesChange={(value) =>
            applyParams({ favorites: value ? "1" : null })
          }
        />

        {lastTrashed ? (
          <UndoBar
            name={lastTrashed.name}
            busy={restoring}
            onRestore={() => {
              void handleRestore();
            }}
            onDismiss={() => setLastTrashed(null)}
          />
        ) : null}

        {vault.error ? (
          <div className="px-3 py-3">
            <Callout tone="danger" title="The vault did not load">
              <p>{vault.error}</p>
              <div className="mt-3">
                <Button
                  size="sm"
                  loading={vault.loading}
                  onClick={() => {
                    void vault.reload();
                  }}
                >
                  <RefreshIcon className="size-4" />
                  Reload the vault
                </Button>
              </div>
            </Callout>
          </div>
        ) : null}

        {vault.loading && vault.items.length === 0 ? (
          <ItemListSkeleton />
        ) : vault.items.length === 0 ? (
          <EmptyVault onCreate={() => setEditor({ item: null })} />
        ) : visibleItems.length === 0 ? (
          <NoFilterMatches
            onClear={() =>
              applyParams({ type: null, folder: null, favorites: null })
            }
          />
        ) : (
          <ItemList
            items={visibleItems}
            folderNameOf={folderNameOf}
            selectedId={selectedId}
            favoriteBusyId={favoriteBusyId}
            onOpen={(item) => setSelectedId(item.id)}
            onToggleFavorite={(item) => {
              void handleToggleFavorite(item);
            }}
            onTrash={(item) => {
              void handleTrash(item);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 py-6 pb-28 sm:px-6 lg:px-9 lg:pb-9">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold text-ink">Vault</h1>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {vault.loading && vault.items.length === 0
              ? "Decrypting your items"
              : `${vault.items.length} ${
                  vault.items.length === 1 ? "item" : "items"
                } sealed in this vault`}
          </p>
        </div>
        <Button
          variant="primary"
          className="hidden lg:inline-flex"
          onClick={() => setEditor({ item: null })}
        >
          <PlusIcon className="size-4" />
          New item
        </Button>
      </header>

      <div className="mt-5">
        <SearchBar
          value={query}
          aiMode={settings?.aiMode ?? null}
          searching={searching}
          hasResults={searchActive}
          onChange={setQuery}
          onSubmit={(term) => {
            void runSearch(term);
          }}
          onClear={clearSearch}
        />
      </div>

      <div className="mt-6 min-[1180px]:grid min-[1180px]:grid-cols-[minmax(0,1fr)_23rem] min-[1180px]:items-start min-[1180px]:gap-6">
        <section
          aria-label="Items"
          className={cn("min-w-0", selectedItem && "hidden min-[1180px]:block")}
        >
          <div className="rounded-lg border border-line bg-surface">
            {searchActive ? renderSearch() : renderList()}
          </div>
        </section>

        {selectedItem ? (
          <aside className="mt-6 min-w-0 min-[1180px]:mt-0">
            <ItemInspector
              item={selectedItem}
              folderName={folderNameOf(selectedItem.folderId)}
              favoriteBusy={favoriteBusyId === selectedItem.id}
              onEdit={() => setEditor({ item: selectedItem })}
              onToggleFavorite={() => {
                void handleToggleFavorite(selectedItem);
              }}
              onTrash={() => {
                void handleTrash(selectedItem);
              }}
              onBack={() => setSelectedId(null)}
            />
          </aside>
        ) : (
          <aside className="hidden min-[1180px]:mt-0 min-[1180px]:block">
            <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
              <p className="text-[13px] text-ink-muted">
                Select an item to see its details here.
              </p>
            </div>
          </aside>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper p-3 lg:hidden">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setEditor({ item: null })}
        >
          <PlusIcon className="size-4" />
          New item
        </Button>
      </div>

      {editor ? (
        <ItemEditor
          item={editor.item}
          defaultFolderId={
            folderFilter && folderFilter !== "none" ? folderFilter : null
          }
          defaultType={typeFilter || undefined}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            setSelectedId(saved.id);
          }}
        />
      ) : null}
    </div>
  );
}
