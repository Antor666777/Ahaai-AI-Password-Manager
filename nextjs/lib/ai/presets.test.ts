import { describe, expect, it } from "vitest";
import { getPreset, listPresets } from "./presets";

describe("provider presets", () => {
  it("has unique ids", () => {
    const ids = listPresets().map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks local runtimes as local and keyless", () => {
    for (const id of ["ollama", "lmstudio", "vllm"]) {
      const preset = getPreset(id);
      expect(preset?.isLocal).toBe(true);
      expect(preset?.requiresKey).toBe(false);
    }
  });

  it("requires keys for cloud providers", () => {
    for (const id of ["openai", "anthropic", "google", "openrouter"]) {
      const preset = getPreset(id);
      expect(preset?.isLocal).toBe(false);
      expect(preset?.requiresKey).toBe(true);
    }
  });

  it("gives OpenAI-compatible cloud presets a base URL", () => {
    for (const id of ["openrouter", "deepseek", "xai"]) {
      expect(getPreset(id)?.baseUrl).toMatch(/^https:\/\//);
    }
  });

  it("offers an optional key for custom endpoints", () => {
    const custom = getPreset("custom-openai");
    expect(custom?.isLocal).toBe(false);
    expect(custom?.requiresKey).toBe(false);
    // A custom endpoint may be a gateway that rejects anything unauthenticated,
    // so the field must exist even though no key is mandatory.
    expect(custom?.keyOptional).toBe(true);
  });

  it("never marks a key as both required and optional", () => {
    for (const preset of listPresets()) {
      expect(preset.requiresKey && preset.keyOptional).toBe(false);
    }
  });

  it("offers no key field for keyless local runtimes", () => {
    for (const id of ["ollama", "lmstudio", "vllm"]) {
      const preset = getPreset(id);
      expect(preset?.requiresKey).toBe(false);
      expect(preset?.keyOptional).toBe(false);
    }
  });
});
