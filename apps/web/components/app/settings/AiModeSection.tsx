"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/controls";
import { Callout, Spinner } from "@/components/ui/feedback";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import type { AiMode, ApiProvider, ApiSettings } from "@/lib/client/types";
import { SettingsSection } from "./SettingsSection";
import { describeApiFailure, failureCopy } from "./apiFailure";

const MODES: { value: AiMode; label: string }[] = [
  { value: "local", label: "This machine" },
  { value: "cloud", label: "Hosted provider" },
];

const CONSEQUENCE: Record<AiMode, string> = {
  local:
    "A model runs on this machine, such as Ollama, LM Studio, or vLLM. Nothing about the search leaves your computer, and a hosted provider cannot serve this mode.",
  cloud:
    "Search context goes to the provider you set as default. Only tokens minted for that one search leave this browser, never your items.",
};

export interface AiModeSectionProps {
  aiMode: AiMode;
  defaultProviderId: string | null;
  defaultProvider: ApiProvider | null;
  defaultPresetLabel: string | null;
  /** True once the provider list has landed, so mismatch copy is never premature. */
  providersReady: boolean;
  localProviderCount: number;
  cloudProviderCount: number;
  onSaved: (settings: ApiSettings) => void;
}

export function AiModeSection({
  aiMode,
  defaultProviderId,
  defaultProvider,
  defaultPresetLabel,
  providersReady,
  localProviderCount,
  cloudProviderCount,
  onSaved,
}: AiModeSectionProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<AiMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<AiMode | null>(null);

  const mode = draft ?? aiMode;

  async function save(next: AiMode) {
    if (saving || next === aiMode) return;
    setDraft(next);
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateAiSettings({ aiMode: next });
      onSaved(result.settings);
      setFailed(null);
      toast.success(
        "AI mode saved",
        next === "local"
          ? "Search context now stays on this machine."
          : "Search context now goes to your default provider.",
      );
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setError(
        failureCopy(failure, "The mode did not save. Try again in a moment."),
      );
      setFailed(next);
    } finally {
      setDraft(null);
      setSaving(false);
    }
  }

  const defaultLabel = defaultProvider
    ? `${defaultProvider.label}${defaultPresetLabel ? ` (${defaultPresetLabel})` : ""}`
    : null;

  let notice: { tone: "warning" | "neutral"; title: string; body: string } | null =
    null;

  if (providersReady && defaultProviderId !== null && defaultProvider === null) {
    notice = {
      tone: "warning",
      title: "The default provider is missing",
      body: "The provider set as default is not in your list any more, so a cloud search has nothing to call. Choose another one in AI providers.",
    };
  } else if (providersReady && defaultProvider && mode === "local" && !defaultProvider.isLocal) {
    notice = {
      tone: "warning",
      title: "Local mode with a hosted default provider",
      body:
        localProviderCount > 0
          ? `${defaultLabel} runs on servers you do not control, so a local search cannot use it. Set your local provider as default in AI providers, or switch the mode to Cloud.`
          : `Local mode needs a provider on this machine and you do not have one yet. Add Ollama, LM Studio, or vLLM in AI providers, or switch the mode to Cloud.`,
    };
  } else if (providersReady && defaultProvider && mode === "cloud" && defaultProvider.isLocal) {
    notice = {
      tone: "warning",
      title: "Cloud mode with a local default provider",
      body:
        cloudProviderCount > 0
          ? `${defaultLabel} runs on this machine, so a cloud search still never leaves it. Set a hosted provider as default in AI providers, or switch the mode to Local.`
          : `Cloud mode needs a hosted provider and you do not have one yet. Add one in AI providers, or switch the mode to Local.`,
    };
  } else if (providersReady && mode === "cloud" && defaultProvider === null) {
    notice = {
      tone: "neutral",
      title: "Cloud mode has no default provider yet",
      body: "A cloud search needs one provider to call. Add one in AI providers and set it as default, or switch the mode to Local.",
    };
  }

  return (
    <SettingsSection
      id="ai-mode"
      title="AI mode"
      consequence="One choice decides where a search travels. Your items stay sealed in this browser either way."
    >
      <div className="panel space-y-3 p-4 sm:p-5">
        <SegmentedControl
          label="AI mode"
          name="ahaai-ai-mode"
          value={mode}
          onChange={(next) => {
            void save(next);
          }}
          options={MODES}
          disabled={saving}
        />
        <p className="max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
          {CONSEQUENCE[mode]}
        </p>
        <p role="status" className="min-h-5 text-[12.5px] text-ink-faint">
          {saving ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3.5" />
              Saving the mode
            </span>
          ) : null}
        </p>
      </div>

      {error ? (
        <div role="alert">
          <Callout tone="danger" title="AI mode was not saved">
            {error}
            <span className="mt-3 block">
              <Button
                size="sm"
                disabled={saving}
                loading={saving}
                onClick={() => {
                  if (failed) void save(failed);
                }}
              >
                Try again
              </Button>
            </span>
          </Callout>
        </div>
      ) : null}

      {notice ? (
        <Callout tone={notice.tone} title={notice.title}>
          {notice.body}
        </Callout>
      ) : null}
    </SettingsSection>
  );
}
