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
});
