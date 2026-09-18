// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HotkeyBinding } from "./hotkeys";

const WINDOWS = "Win32";
const MACINTEL = "MacIntel";

const handler = () => {};

/**
 * The platform is fixed at module load, so each test imports a fresh copy of
 * the module under a chosen `navigator.platform`. That keeps the assertions
 * about the modifier key independent of the machine running the suite.
 */
async function loadHotkeys(platform: string) {
  vi.resetModules();
  vi.stubGlobal("navigator", { platform, userAgent: platform });
  return import("./hotkeys");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** A stand-in for a KeyboardEvent, so no DOM event needs to be dispatched. */
function key(overrides: Record<string, unknown> = {}): KeyboardEvent {
  return {
    key: "k",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent;
}

function binding(overrides: Partial<HotkeyBinding> = {}): HotkeyBinding {
  return { key: "k", handler, ...overrides };
}

describe("matchesBinding", () => {
  it("matches a plain key and ignores an already-handled event", async () => {
    const { matchesBinding } = await loadHotkeys(WINDOWS);

    expect(matchesBinding(key(), binding())).toBe(true);
    expect(matchesBinding(key({ defaultPrevented: true }), binding())).toBe(
      false,
    );
  });

  it("compares the key case-insensitively", async () => {
    const { matchesBinding } = await loadHotkeys(WINDOWS);

    expect(matchesBinding(key({ key: "K" }), binding({ key: "k" }))).toBe(true);
    expect(matchesBinding(key({ key: "k" }), binding({ key: "K" }))).toBe(true);
    expect(matchesBinding(key({ key: "j" }), binding({ key: "k" }))).toBe(false);
  });

  it("stays out of text fields unless the binding opts in", async () => {
    const { matchesBinding } = await loadHotkeys(WINDOWS);

    expect(matchesBinding(key({ target: { tagName: "INPUT" } }), binding())).toBe(
      false,
    );
    expect(
      matchesBinding(key({ target: { tagName: "TEXTAREA" } }), binding()),
    ).toBe(false);
    expect(
      matchesBinding(key({ target: { tagName: "SELECT" } }), binding()),
    ).toBe(false);
    expect(
      matchesBinding(key({ target: { isContentEditable: true } }), binding()),
    ).toBe(false);
    expect(
      matchesBinding(
        key({ target: { getAttribute: () => "" } }),
        binding(),
      ),
    ).toBe(false);

    expect(
      matchesBinding(
        key({ target: { tagName: "INPUT" } }),
        binding({ allowInInput: true }),
      ),
    ).toBe(true);
  });

  it("treats contenteditable=false as a normal target", async () => {
    const { matchesBinding } = await loadHotkeys(WINDOWS);

    expect(
      matchesBinding(
        key({ target: { getAttribute: () => "false" } }),
        binding(),
      ),
    ).toBe(true);
  });

  it("reads the focused element when the event has no target", async () => {
    const { matchesBinding } = await loadHotkeys(WINDOWS);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    expect(matchesBinding(key(), binding())).toBe(false);
    expect(matchesBinding(key(), binding({ allowInInput: true }))).toBe(true);

    input.remove();
  });

  it("requires the modifiers to be satisfied exactly", async () => {
    const { matchesBinding } = await loadHotkeys(WINDOWS);

    // Ctrl on, mod required.
    expect(matchesBinding(key({ ctrlKey: true }), binding({ mod: true }))).toBe(
      true,
    );
    // Ctrl on, mod not required: the plain binding must not fire.
    expect(matchesBinding(key({ ctrlKey: true }), binding())).toBe(false);
    // Ctrl off, mod required.
    expect(matchesBinding(key({ ctrlKey: false }), binding({ mod: true }))).toBe(
      false,
    );

    // Shift behaves the same way.
    expect(
      matchesBinding(key({ shiftKey: true }), binding({ shift: true })),
    ).toBe(true);
    expect(matchesBinding(key({ shiftKey: true }), binding())).toBe(false);
    expect(
      matchesBinding(key({ shiftKey: false }), binding({ shift: true })),
    ).toBe(false);

    // The example from the spec: a plain `/` must not fire while mod is held.
    expect(
      matchesBinding(
        key({ key: "/", ctrlKey: true }),
        binding({ key: "/" }),
      ),
    ).toBe(false);
    expect(
      matchesBinding(
        key({ key: "/", ctrlKey: true }),
        binding({ key: "/", mod: true }),
      ),
    ).toBe(true);
  });

  it("uses ⌘ as the modifier on macOS and Ctrl elsewhere", async () => {
    const mac = await loadHotkeys(MACINTEL);
    expect(mac.IS_MAC).toBe(true);
    expect(mac.MOD_LABEL).toBe("⌘");
    expect(mac.matchesBinding(key({ metaKey: true }), binding({ mod: true }))).toBe(
      true,
    );
    expect(mac.matchesBinding(key({ ctrlKey: true }), binding({ mod: true }))).toBe(
      false,
    );

    const windows = await loadHotkeys(WINDOWS);
    expect(windows.IS_MAC).toBe(false);
    expect(windows.MOD_LABEL).toBe("Ctrl");
    expect(
      windows.matchesBinding(key({ ctrlKey: true }), binding({ mod: true })),
    ).toBe(true);
    expect(
      windows.matchesBinding(key({ metaKey: true }), binding({ mod: true })),
    ).toBe(false);
  });
});
