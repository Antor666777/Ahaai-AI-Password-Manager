"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Callout, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import type {
  ApiProvider,
  ApiSettings,
  ProviderPreset,
} from "@/lib/client/types";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { SettingsSection } from "./SettingsSection";
import { describeApiFailure, failureCopy } from "./apiFailure";

export interface ProvidersSectionProps {
  providers: ApiProvider[];
  presets: ProviderPreset[];
  loading: boolean;
  loadError: string | null;
  onReload: () => void;
  settings: ApiSettings;
  onSettings: (settings: ApiSettings) => void;
  onAdded: (provider: ApiProvider) => void;
  onRemoved: (id: string) => void;
  onUpdated: (provider: ApiProvider) => void;
}

export function ProvidersSection({
  providers,
  presets,
  loading,
  loadError,
  onReload,
  settings,
  onSettings,
  onAdded,
  onRemoved,
  onUpdated,
}: ProvidersSectionProps) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const canAdd = presets.length > 0;

  async function setDefault(provider: ApiProvider) {
    setBusyId(provider.id);
    setActionError(null);
    try {
      const result = await api.updateAiSettings({
        defaultProviderId: provider.id,
      });
      onSettings(result.settings);
      toast.success(
        "Default provider set",
        `${provider.label} now answers a cloud search.`,
      );
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setActionError({
        id: provider.id,
        message: failureCopy(
          failure,
          "The default was not changed. Try again in a moment.",
        ),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(provider: ApiProvider) {
    setDeletingId(provider.id);
    setActionError(null);
    try {
      await api.deleteProvider(provider.id);
      onRemoved(provider.id);
      if (settings.defaultProviderId === provider.id) {
        // The stored default would point at a row that no longer exists.
        const result = await api.updateAiSettings({ defaultProviderId: null });
        onSettings(result.settings);
      }
      toast.success(
        "Provider deleted",
        `${provider.label} and its stored key are gone from this account.`,
      );
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setActionError({
        id: provider.id,
        message: failureCopy(
          failure,
          "The provider was not deleted. Try again in a moment.",
        ),
      });
    } finally {
      setDeletingId(null);
    }
  }

  function countLine(): string {
    if (providers.length === 1) return "One provider set up.";
    return `${providers.length} providers set up.`;
  }

  return (
    <SettingsSection
      id="ai-providers"
      title="AI providers"
      consequence="Ahaai calls the provider marked as default when the mode is Cloud. Keys are stored encrypted and read back only as a mask."
    >
      {loading ? (
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading your AI providers.</span>
          {[0, 1].map((index) => (
            <div key={index} className="panel space-y-3 p-4 sm:p-5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-8 w-40" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && loadError ? (
        <Callout tone="danger" title="Providers did not load">
          {loadError}
          <span className="mt-3 block">
            <Button size="sm" onClick={onReload}>
              Retry
            </Button>
          </span>
        </Callout>
      ) : null}

      {!loading && !loadError ? (
        <div className="space-y-4">
          {adding && canAdd ? (
            <ProviderForm
              presets={presets}
              onAdded={(provider) => {
                onAdded(provider);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : null}

          {providers.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="nums text-[12.5px] text-ink-faint">
                {countLine()}
              </p>
              {canAdd && !adding ? (
                <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                  Add provider
                </Button>
              ) : null}
            </div>
          ) : null}

          {providers.length === 0 && !adding ? (
            canAdd ? (
              <div className="panel">
                <EmptyState
                  icon={
                    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
                      <path
                        d="M6.5 3v3.5M13.5 3v3.5M4.5 6.5h11V9a5.5 5.5 0 0 1-11 0V6.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M10 14.5V17"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  }
                  title="No AI provider yet"
                  description="A provider is the model that ranks your search: a hosted service such as OpenAI, or a runtime on this machine such as Ollama. Ahaai sends placeholder tokens for one request, never your items."
                  action={
                    <Button variant="primary" onClick={() => setAdding(true)}>
                      Add your first provider
                    </Button>
                  }
                />
              </div>
            ) : (
              <Callout tone="warning" title="No provider presets are available">
                Ahaai could not reach its preset list, so a provider cannot be
                added right now. Reload the page, then try again.
              </Callout>
            )
          ) : null}

          {providers.length > 0 ? (
            <div className="space-y-4">
              {providers.map((provider) => {
                const preset =
                  presets.find((item) => item.id === provider.presetId) ?? null;
                return (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    preset={preset}
                    presetLabel={preset?.label ?? provider.presetId}
                    isDefault={settings.defaultProviderId === provider.id}
                    settingDefault={busyId === provider.id}
                    deleting={deletingId === provider.id}
                    actionError={
                      actionError && actionError.id === provider.id
                        ? actionError.message
                        : null
                    }
                    onSetDefault={(item) => {
                      void setDefault(item);
                    }}
                    onDelete={remove}
                    onUpdated={onUpdated}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsSection>
  );
}
