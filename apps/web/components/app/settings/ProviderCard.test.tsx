// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getPreset } from "@ahaai/core/ai/presets";
import { ToastProvider } from "@/lib/client/toast";
import type { ApiProvider, ProviderPreset } from "@/lib/client/types";
import { ProviderCard } from "./ProviderCard";

afterEach(cleanup);

const provider: ApiProvider = {
  id: "11111111-1111-4111-8111-111111111111",
  presetId: "custom-openai",
  label: "gateway",
  baseUrl: "https://gateway.example.com/v1",
  defaultModel: "gpt-4o-mini",
  isLocal: false,
  hasApiKey: false,
  apiKeyMask: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderCard() {
  return render(
    <ToastProvider>
      <ProviderCard
        provider={provider}
        preset={getPreset("custom-openai") as ProviderPreset}
        presetLabel="Custom OpenAI-compatible endpoint"
        isDefault={false}
        settingDefault={false}
        deleting={false}
        actionError={null}
        onSetDefault={() => {}}
        onDelete={async () => {}}
        onUpdated={() => {}}
      />
    </ToastProvider>,
  );
}

describe("ProviderCard key editing", () => {
  it("says a custom endpoint may expect a key", () => {
    renderCard();
    expect(screen.getByText(/This endpoint may expect one/)).toBeTruthy();
  });

  it("offers to set a key on a provider that has none", () => {
    renderCard();
    expect(screen.queryByLabelText(/API key for gateway/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set API key" }));

    expect(screen.getByLabelText(/API key for gateway/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save key" })).toBeTruthy();
  });
});
