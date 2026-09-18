"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/overlay";
import { useSession } from "@/lib/client/session";
import { useVault } from "@/lib/client/vault";
import type { DecryptedItem, ItemType, LoginPayload } from "@/lib/client/types";
import {
  FolderIcon,
  HealthIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
} from "./Icons";

/** How many item matches the palette will offer before it stops. */
const ITEM_LIMIT = 8;

const TYPE_LABEL: Record<ItemType, string> = {
  login: "Login",
  card: "Card",
  identity: "Identity",
  secure_note: "Secure note",
};

interface PaletteOption {
  /** Stable DOM id, also used as the `aria-activedescendant` value. */
  id: string;
  label: string;
  /** Secondary text: an item's username, or the kind of action. */
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

interface PaletteGroup {
  id: string;
  label: string;
  options: PaletteOption[];
}

export interface CommandPaletteProps {
  onClose: () => void;
}

/** The username a login was saved under, when it has one. */
function itemHint(item: DecryptedItem): string {
  if (item.type === "login") {
    const username = (item.data as LoginPayload).username?.trim();
    if (username) return username;
  }
  return TYPE_LABEL[item.type];
}

/**
 * A ⌘K palette over the vault: type to filter decrypted items, then run an
 * action or jump to a page. It is mounted only while it is open, so every open
 * starts from a clean slate.
 *
 * Focus never leaves the input — the active result is announced through
 * `aria-activedescendant`, so the DOM focus is never moved onto a result.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { items } = useVault();
  const { lock } = useSession();

  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Runs after the <dialog> has been shown (a child's effects fire before the
  // parent's), so the input is focusable by the time it is asked to take focus.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const groups = useMemo<PaletteGroup[]>(() => {
    const term = query.trim().toLowerCase();

    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };

    const itemOptions: PaletteOption[] = term
      ? items
          .filter((item) => {
            if (item.name.toLowerCase().includes(term)) return true;
            if (item.type !== "login") return false;
            const username = (item.data as LoginPayload).username ?? "";
            return username.toLowerCase().includes(term);
          })
          .slice(0, ITEM_LIMIT)
          .map((item) => ({
            id: `palette-item-${item.id}`,
            label: item.name,
            hint: itemHint(item),
            icon: item.favorite ? <StarIcon filled /> : <FolderIcon />,
            run: go(`/vault?item=${item.id}`),
          }))
      : [];

    const actionOptions: PaletteOption[] = [
      {
        id: "palette-action-new",
        label: "New item",
        hint: "Create",
        icon: <PlusIcon />,
        run: go("/vault?new=1"),
      },
      {
        id: "palette-action-lock",
        label: "Lock vault",
        hint: "Session",
        icon: <LockIcon />,
        run: () => {
          lock();
          router.replace("/unlock");
          onClose();
        },
      },
    ].filter((option) => !term || option.label.toLowerCase().includes(term));

    const gotoOptions: PaletteOption[] = [
      { id: "palette-goto-health", label: "Health", icon: <HealthIcon />, run: go("/vault/health") },
      { id: "palette-goto-trash", label: "Trash", icon: <TrashIcon />, run: go("/vault/trash") },
      { id: "palette-goto-security", label: "Security", icon: <ShieldIcon />, run: go("/vault/security") },
      { id: "palette-goto-settings", label: "Settings", icon: <SettingsIcon />, run: go("/vault/settings") },
    ].filter((option) => !term || option.label.toLowerCase().includes(term));

    const next: PaletteGroup[] = [];
    if (itemOptions.length > 0) {
      next.push({ id: "items", label: "Items", options: itemOptions });
    }
    if (actionOptions.length > 0) {
      next.push({ id: "actions", label: "Actions", options: actionOptions });
    }
    if (gotoOptions.length > 0) {
      next.push({ id: "goto", label: "Go to", options: gotoOptions });
    }
    return next;
  }, [query, items, router, lock, onClose]);

  const flat = useMemo(() => groups.flatMap((group) => group.options), [groups]);

  /**
   * The highlighted option, derived rather than stored-and-reset: when the
   * stored id is no longer in the list (a new query filtered it out) the first
   * result takes over, with no effect and no cascading render.
   */
  const active = useMemo(
    () => flat.find((option) => option.id === activeId) ?? flat[0] ?? null,
    [flat, activeId],
  );

  useEffect(() => {
    if (!active) return;
    const node = document.getElementById(active.id);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  function moveActive(delta: number) {
    if (flat.length === 0 || !active) return;
    const current = flat.findIndex((option) => option.id === active.id);
    const next = (current + delta + flat.length) % flat.length;
    setActiveId(flat[next].id);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      if (!active) return;
      event.preventDefault();
      active.run();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Command palette"
      description="Type to find an item, an action or a page."
    >
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={flat.length > 0 ? listboxId : undefined}
            aria-activedescendant={active?.id}
            aria-autocomplete="list"
            aria-label="Search commands and items"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search items, actions and pages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="h-11 w-full rounded-md border border-line bg-surface ps-9 pe-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:border-primary"
          />
        </div>

        {flat.length === 0 ? (
          <p
            role="status"
            className="px-1 py-8 text-center text-[13px] text-ink-muted"
          >
            No matches
          </p>
        ) : (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Results"
            className="max-h-[55vh] space-y-3 overflow-y-auto"
          >
            {groups.map((group) => (
              <div
                key={group.id}
                role="group"
                aria-labelledby={`${group.id}-heading`}
              >
                <p
                  id={`${group.id}-heading`}
                  className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint"
                >
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.options.map((option) => {
                    const selected = option.id === active?.id;
                    return (
                      <li key={option.id}>
                        <div
                          id={option.id}
                          role="option"
                          aria-selected={selected}
                          onClick={option.run}
                          onMouseMove={() => setActiveId(option.id)}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-[13px]",
                            selected
                              ? "bg-surface-2 text-ink"
                              : "text-ink-muted hover:bg-surface-2",
                          )}
                        >
                          <span className="text-ink-faint" aria-hidden="true">
                            {option.icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-ink">
                            {option.label}
                          </span>
                          {option.hint ? (
                            <span className="max-w-[45%] truncate text-[12px] text-ink-faint">
                              {option.hint}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
