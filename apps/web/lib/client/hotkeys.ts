"use client";

import { useEffect, useRef } from "react";

/**
 * One keyboard shortcut and what it does.
 *
 * `mod` is the platform modifier: ⌘ on macOS and Ctrl everywhere else. A
 * binding only fires when its modifier requirements are met exactly, so a plain
 * `/` never fires while `mod` is held, and vice versa.
 */
export interface HotkeyBinding {
  /** The `KeyboardEvent.key` to match, compared case-insensitively. */
  key: string;
  /** Require the platform modifier (⌘/Ctrl). */
  mod?: boolean;
  /** Require Shift, matched as exactly as `mod` is. */
  shift?: boolean;
  /** Fire even while a text field has focus. Off by default. */
  allowInInput?: boolean;
  handler: (event: KeyboardEvent) => void;
}

/**
 * The platform is resolved once, at module load, rather than on every
 * keystroke: the answer cannot change while the tab is open, and reading it per
 * event is both wasted work and a chance for two events to disagree.
 */
function detectMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  // `userAgentData.platform` is the modern signal, but it is not in the current
  // DOM lib types, so it is read through a narrow cast with a `platform`
  // fallback for browsers that predate it.
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const platform = uaData?.platform || navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** True on a Mac (or an iOS device with a hardware keyboard), false elsewhere. */
export const IS_MAC = detectMacPlatform();

/** The word or glyph to show for the platform modifier in hints. */
export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);

/**
 * Whether a node is a place the user is typing. Duck-typed on purpose: it is
 * called on real elements and on the hand-built objects the tests pass in, and
 * it returns false for anything that is not element shaped.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const node = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: unknown;
  };
  if (
    typeof node.tagName === "string" &&
    EDITABLE_TAGS.has(node.tagName.toLowerCase())
  ) {
    return true;
  }
  if (node.isContentEditable === true) return true;
  if (typeof node.getAttribute === "function") {
    const value = (node.getAttribute as (name: string) => unknown).call(
      target,
      "contenteditable",
    );
    // The attribute is present but switched off only when it reads "false".
    if (typeof value === "string" && value.toLowerCase() !== "false") return true;
  }
  return false;
}

function modPressed(event: KeyboardEvent): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey;
}

/**
 * The event target is the focused element for a real keydown; the document's
 * active element is the fallback when the event is synthesised or aimed at the
 * window. Checking both keeps the "do not hijack typing" rule true either way.
 */
function targetIsEditable(event: KeyboardEvent): boolean {
  if (isEditableTarget(event.target)) return true;
  return typeof document !== "undefined" && isEditableTarget(document.activeElement);
}

/**
 * Pure predicate: does this event satisfy this binding? Framework-free, so it
 * can be reasoned about and tested without React or a DOM.
 */
export function matchesBinding(
  event: KeyboardEvent,
  binding: HotkeyBinding,
): boolean {
  if (event.defaultPrevented) return false;
  if (!binding.allowInInput && targetIsEditable(event)) return false;
  if (typeof event.key !== "string") return false;
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;
  if (modPressed(event) !== (binding.mod ?? false)) return false;
  if (event.shiftKey !== (binding.shift ?? false)) return false;
  return true;
}

/**
 * Attaches a single `keydown` listener to the window for the life of the
 * component. The latest bindings are held in a ref, so the listener is attached
 * once and never re-wired by a re-render.
 *
 * Only a genuine match is claimed with `preventDefault()`. `stopPropagation()`
 * is never called: the session's idle tracker listens for the same event to
 * reset the auto-lock timer, and it must keep seeing every keystroke.
 */
export function useHotkeys(bindings: HotkeyBinding[]): void {
  const latest = useRef(bindings);

  useEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      for (const binding of latest.current) {
        if (!matchesBinding(event, binding)) continue;
        event.preventDefault();
        binding.handler(event);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
