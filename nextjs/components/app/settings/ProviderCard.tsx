"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MonoValue } from "@/components/ui/data";
import { Badge, InlineError } from "@/components/ui/feedback";
import { PasswordField } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import type { ApiProvider, ProviderPreset } from "@/lib/client/types";
import { SettingList, SettingRow } from "./SettingsSection";
import { describeApiFailure, failureCopy } from "./apiFailure";

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; modelId: string; latencyMs: number }
  | { status: "failed"; message: string };

export interface ProviderCardProps {
  provider: ApiProvider;
  preset: ProviderPreset | null;
  presetLabel: string;
  isDefault: boolean;
  settingDefault: boolean;
  deleting: boolean;
  /** Failure from the last action on this provider, if any. */
  actionError: string | null;
  onSetDefault: (provider: ApiProvider) => void;
  onDelete: (provider: ApiProvider) => Promise<void>;
  onUpdated: (provider: ApiProvider) => void;
}

export function ProviderCard({
  provider,
  preset,
  presetLabel,
  isDefault,
  settingDefault,
  deleting,
  actionError,
  onSetDefault,
  onDelete,
  onUpdated,
}: ProviderCardProps) {
  const toast = useToast();
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  async function saveKey() {
    if (savingKey) return;
    const trimmed = keyValue.trim();
    if (trimmed.length === 0) {
      setKeyError("Paste the key this endpoint expects, then save.");
      return;
    }

    setSavingKey(true);
    setKeyError(null);
    try {
      const result = await api.updateProvider(provider.id, { apiKey: trimmed });
      onUpdated(result.provider);
      setKeyOpen(false);
      setKeyValue("");
      toast.success(
        "API key saved",
        `${provider.label} now sends this key. It is stored encrypted.`,
      );
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setKeyError(
        failureCopy(failure, "The key was not saved. Try again in a moment."),
      );
    } finally {
      setSavingKey(false);
    }
  }

  async function testConnection() {
    if (test.status === "running") return;
    setTest({ status: "running" });
    try {
      const result = await api.testProvider(provider.id);
      setTest({
        status: "done",
        modelId: result.modelId,
        latencyMs: result.latencyMs,
      });
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setTest({
        status: "failed",
        message: failureCopy(
          failure,
          "The test did not finish. Try again in a moment.",
        ),
      });
    }
  }

  async function confirmDelete() {
    await onDelete(provider);
    setConfirmOpen(false);
  }

  const modelHint =
    preset && preset.defaultModels.length === 0
      ? "Not set. Ahaai needs a model id before this provider can answer a search."
      : "Not set, so the preset's first model is used.";

  return (
    <article
      aria-label={provider.label}
      className="panel space-y-3 p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            title={provider.label}
            className="truncate text-[13px] font-semibold text-ink"
          >
            {provider.label}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge>{presetLabel}</Badge>
            {provider.isLocal ? (
              <Badge tone="accent">Runs on this machine</Badge>
            ) : (
              <Badge>Hosted service</Badge>
            )}
            {isDefault ? (
              <Badge tone="success">Default</Badge>
            ) : null}
          </div>
        </div>
      </header>

      <SettingList className="border-t border-line">
        <SettingRow label="Model">
          {provider.defaultModel ? (
            <MonoValue value={provider.defaultModel} />
          ) : (
            <span className="text-ink-muted">{modelHint}</span>
          )}
        </SettingRow>

        {provider.baseUrl ? (
          <SettingRow label="Base URL">
            <MonoValue value={provider.baseUrl} />
          </SettingRow>
        ) : null}

        <SettingRow label="API key">
          {provider.apiKeyMask ? (
            <MonoValue value={provider.apiKeyMask} />
          ) : (
            <span className="text-ink-muted">
              {preset?.requiresKey
                ? "No key stored. This provider cannot answer a search without one."
                : preset?.keyOptional
                  ? "No key stored. This endpoint may expect one."
                  : "No key stored. This endpoint does not need one."}
            </span>
          )}
        </SettingRow>
      </SettingList>

      {keyOpen ? (
        <form
          noValidate
          className="space-y-3 border-t border-line pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveKey();
          }}
        >
          <PasswordField
            id={`ahaai-provider-key-${provider.id}`}
            name="provider-api-key"
            label={
              provider.hasApiKey
                ? `New API key for ${provider.label}`
                : `API key for ${provider.label}`
            }
            value={keyValue}
            autoComplete="off"
            disabled={savingKey}
            error={keyError}
            hint="Stored encrypted. Ahaai shows only a mask after saving."
            onChange={(value) => {
              setKeyValue(value);
              if (keyError) setKeyError(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="primary" loading={savingKey}>
              Save key
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={savingKey}
              onClick={() => {
                setKeyOpen(false);
                setKeyValue("");
                setKeyError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          loading={test.status === "running"}
          onClick={() => {
            void testConnection();
          }}
        >
          Test connection
        </Button>
        {isDefault ? null : (
          <Button
            size="sm"
            loading={settingDefault}
            onClick={() => onSetDefault(provider)}
          >
            Set as default
          </Button>
        )}
        <Button
          size="sm"
          disabled={savingKey}
          onClick={() => {
            setKeyOpen((open) => !open);
            setKeyError(null);
          }}
        >
          {provider.hasApiKey ? "Replace API key" : "Set API key"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmOpen(true)}
        >
          Delete provider
        </Button>
      </div>

      {test.status === "done" ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 text-[12.5px] leading-relaxed text-ink-muted"
        >
          <Badge tone="success">Reached</Badge>
          <span>
            Answered with{" "}
            <span className="mono-data text-ink">{test.modelId}</span> in{" "}
            <span className="nums text-ink">{test.latencyMs}</span> ms.
          </span>
        </p>
      ) : null}

      {test.status === "failed" ? (
        <div role="alert">
          <InlineError>{test.message}</InlineError>
        </div>
      ) : null}

      {actionError ? (
        <div role="alert">
          <InlineError>{actionError}</InlineError>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          void confirmDelete();
        }}
        title={`Delete ${provider.label}`}
        description={
          isDefault
            ? "This removes the provider and its stored key from your account, and clears it as your default, so cloud search will need another one. Searches that used it stop working."
            : "This removes the provider and its stored key from your account. Searches that used it stop working."
        }
        confirmLabel="Delete provider"
        loading={deleting}
      />
    </article>
  );
}
