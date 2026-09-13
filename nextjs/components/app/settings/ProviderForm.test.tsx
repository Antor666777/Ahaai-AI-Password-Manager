// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROVIDER_PRESETS } from "@/lib/ai/presets";
import { ToastProvider } from "@/lib/client/toast";
import type { ProviderPreset } from "@/lib/client/types";
import { ProviderForm } from "./ProviderForm";

afterEach(cleanup);

const presets = PROVIDER_PRESETS as ProviderPreset[];

function renderForm() {
  return render(
    <ToastProvider>
      <ProviderForm presets={presets} onAdded={() => {}} onCancel={() => {}} />
    </ToastProvider>,
  );
}

function choosePreset(id: string) {
  fireEvent.change(screen.getByLabelText("Provider"), {
    target: { value: id },
  });
}

describe("ProviderForm key field", () => {
  it("asks for a required key on OpenAI", () => {
    renderForm();
    expect(screen.getByLabelText(/API key for OpenAI/)).toBeTruthy();
  });

  it("offers an optional key on a custom endpoint", () => {
    renderForm();
    choosePreset("custom-openai");

    const field = screen.getByLabelText(
      /API key for Custom OpenAI-compatible endpoint \(optional\)/,
    );
    expect(field).toBeTruthy();
    // Optional means the browser does not block submission on an empty value.
    expect(field.hasAttribute("required")).toBe(false);
  });

  it("hides the key field on a keyless local runtime", () => {
    renderForm();
    choosePreset("ollama");
    expect(screen.queryByLabelText(/API key/)).toBeNull();
  });
});
