"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PasswordField, SelectField, TextInput } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { useToast } from "@/lib/client/toast";
import type { ApiProvider, ProviderPreset } from "@/lib/client/types";
import { describeApiFailure, failureCopy } from "./apiFailure";

const CUSTOM_MODEL = "__custom__";

interface FieldErrors {
  presetId?: string;
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

/** Copy the server's rejection into something the field can own. */
const FIELD_COPY: Record<string, string> = {
  presetId: "Pick a provider from the list, then add it again.",
  label: "Use a label of 1 to 80 characters, for example Work OpenAI.",
  apiKey: "Paste the key this provider expects, then add it again.",
  baseUrl:
    "Use a full URL of 2048 characters or less, scheme included, for example https://api.example.com/v1.",
  defaultModel: "Use a model id of 1 to 200 characters.",
};

const ERROR_KEYS: (keyof FieldErrors)[] = [
  "presetId",
  "label",
  "apiKey",
  "baseUrl",
  "defaultModel",
];

function isFieldErrorKey(value: string): value is keyof FieldErrors {
  return ERROR_KEYS.includes(value as keyof FieldErrors);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface ProviderFormProps {
  presets: ProviderPreset[];
  onAdded: (provider: ApiProvider) => void;
  onCancel: () => void;
}

export function ProviderForm({ presets, onAdded, onCancel }: ProviderFormProps) {
  const toast = useToast();
  const firstPreset = presets.at(0) ?? null;

  const [presetId, setPresetId] = useState(firstPreset?.id ?? "");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(firstPreset?.baseUrl ?? "");
  const [model, setModel] = useState(
    firstPreset?.defaultModels.at(0) ?? CUSTOM_MODEL,
  );
  const [customModel, setCustomModel] = useState("");
  const [presetIdError, setPresetIdError] = useState<string | undefined>();
  const [labelError, setLabelError] = useState<string | undefined>();
  const [apiKeyError, setApiKeyError] = useState<string | undefined>();
  const [baseUrlError, setBaseUrlError] = useState<string | undefined>();
  const [modelError, setModelError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const presetShell = useRef<HTMLDivElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const keyShell = useRef<HTMLDivElement>(null);
  const baseUrlInput = useRef<HTMLInputElement>(null);
  const modelShell = useRef<HTMLDivElement>(null);

  const preset = presets.find((item) => item.id === presetId) ?? firstPreset;
  if (!preset) return null;
  /** Bound once so the submit handlers keep the non-null type. */
  const activePreset: ProviderPreset = preset;

  const keyRequired = preset.requiresKey;
  const wantsKey = keyRequired || preset.keyOptional;
  const wantsBaseUrl = preset.isLocal || preset.kind === "openai-compatible";
  const modelId = model === CUSTOM_MODEL ? customModel.trim() : model;
  const localPresets = presets.filter((item) => item.isLocal);
  const hostedPresets = presets.filter((item) => !item.isLocal);

  function clearErrors() {
    setPresetIdError(undefined);
    setLabelError(undefined);
    setApiKeyError(undefined);
    setBaseUrlError(undefined);
    setModelError(undefined);
    setFormError(null);
  }

  function changePreset(nextId: string) {
    const next = presets.find((item) => item.id === nextId) ?? null;
    setPresetId(nextId);
    setBaseUrl(next?.baseUrl ?? "");
    setModel(next?.defaultModels.at(0) ?? CUSTOM_MODEL);
    setCustomModel("");
    setApiKey("");
    clearErrors();
  }

  function focusFirstInvalid(errors: FieldErrors) {
    if (errors.presetId) {
      presetShell.current?.querySelector<HTMLSelectElement>("select")?.focus();
    } else if (errors.label) {
      labelInput.current?.focus();
    } else if (errors.apiKey) {
      keyShell.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else if (errors.baseUrl) {
      baseUrlInput.current?.focus();
    } else if (errors.defaultModel) {
      modelShell.current?.querySelector<HTMLElement>("input, select")?.focus();
    }
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const trimmedLabel = label.trim();
    const trimmedBaseUrl = baseUrl.trim();

    if (trimmedLabel.length === 0) {
      errors.label = "Add a label so you can tell this provider apart in the list.";
    } else if (trimmedLabel.length > 80) {
      errors.label = "Keep the label to 80 characters or less.";
    }

    if (keyRequired && apiKey.trim().length === 0) {
      errors.apiKey = `Paste the API key for ${activePreset.label}. Ahaai stores it encrypted and shows only a mask after this.`;
    }

    if (wantsBaseUrl) {
      if (trimmedBaseUrl.length === 0) {
        errors.baseUrl = `Enter the base URL ${activePreset.label} answers on, for example http://localhost:11434/v1.`;
      } else if (!isHttpUrl(trimmedBaseUrl)) {
        errors.baseUrl =
          "Use a full URL including the scheme, for example https://api.example.com/v1.";
      } else if (!activePreset.isLocal && !trimmedBaseUrl.startsWith("https://")) {
        errors.baseUrl =
          "Hosted endpoints need https. Pick a local preset for http on this machine.";
      }
    }

    if (model === CUSTOM_MODEL && customModel.trim().length === 0) {
      errors.defaultModel =
        "Type the model id this endpoint serves, for example llama3.2.";
    } else if (modelId.length > 200) {
      errors.defaultModel = "Keep the model id to 200 characters or less.";
    }

    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormError(null);
      setPresetIdError(errors.presetId);
      setLabelError(errors.label);
      setApiKeyError(errors.apiKey);
      setBaseUrlError(errors.baseUrl);
      setModelError(errors.defaultModel);
      focusFirstInvalid(errors);
      return;
    }

    clearErrors();
    setSubmitting(true);
    try {
      const result = await api.createProvider({
        presetId: activePreset.id,
        label: label.trim(),
        apiKey: apiKey.trim().length > 0 ? apiKey.trim() : null,
        baseUrl: wantsBaseUrl ? baseUrl.trim() : null,
        defaultModel: modelId.length > 0 ? modelId : null,
      });
      toast.success(
        "Provider added",
        `${result.provider.label} is ready for AI search.`,
      );
      onAdded(result.provider);
    } catch (caught) {
      const failure = describeApiFailure(caught);
      const mapped: FieldErrors = {};
      for (const field of failure.fields) {
        if (isFieldErrorKey(field)) mapped[field] = FIELD_COPY[field];
      }
      if (failure.code === "CONFLICT") {
        mapped.label =
          "A provider with this preset and the same label already exists. Change the label, then add it again.";
      }
      if (
        failure.code === "BAD_REQUEST" &&
        wantsKey &&
        (failure.serverMessage ?? "").toLowerCase().includes("api key")
      ) {
        mapped.apiKey = `${activePreset.label} needs an API key. Paste one, then add the provider.`;
      }

      if (Object.keys(mapped).length > 0) {
        setPresetIdError(mapped.presetId);
        setLabelError(mapped.label);
        setApiKeyError(mapped.apiKey);
        setBaseUrlError(mapped.baseUrl);
        setModelError(mapped.defaultModel);
        setFormError(null);
        focusFirstInvalid(mapped);
      } else {
        setFormError(
          failureCopy(
            failure,
            "The provider was not added. Try again in a moment.",
          ),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-labelledby="ahaai-add-provider-heading"
      className="animate-fade space-y-4 rounded-lg border border-line bg-surface-2 p-4 sm:p-5"
    >
      <div className="space-y-0.5">
        <h3
          id="ahaai-add-provider-heading"
          className="text-[13px] font-semibold text-ink"
        >
          Add a provider
        </h3>
        <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-ink-muted">
          The key travels once over this connection, is stored encrypted, and
          comes back to this page only as a mask.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div ref={presetShell}>
          <SelectField
            label="Provider"
            value={presetId}
            disabled={submitting}
            error={presetIdError ?? null}
            hint="The preset fills in the endpoint and a starting model."
            onChange={(event) => changePreset(event.target.value)}
          >
            {localPresets.length > 0 ? (
              <optgroup label="Runs on this machine">
                {localPresets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {hostedPresets.length > 0 ? (
              <optgroup label="Hosted services">
                {hostedPresets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </SelectField>
        </div>

        <TextInput
          ref={labelInput}
          label="Label"
          name="provider-label"
          value={label}
          maxLength={80}
          spellCheck={false}
          disabled={submitting}
          error={labelError ?? null}
          hint="Shown in this list only, so name it for you."
          placeholder="Work OpenAI"
          onChange={(event) => {
            setLabel(event.target.value);
            if (labelError) setLabelError(undefined);
          }}
        />

        {wantsKey ? (
          <div ref={keyShell} className="sm:col-span-2">
            <PasswordField
              id="ahaai-provider-key"
              name="provider-api-key"
              label={
                keyRequired
                  ? `API key for ${preset.label}`
                  : `API key for ${preset.label} (optional)`
              }
              value={apiKey}
              autoComplete="off"
              disabled={submitting}
              error={apiKeyError ?? null}
              hint={
                keyRequired
                  ? "Required by this provider. Ahaai never sends it back to this page."
                  : "Send this only if the endpoint expects one. A key is stored encrypted and read back as a mask; add or replace it later from the provider card."
              }
              onChange={(value) => {
                setApiKey(value);
                if (apiKeyError) setApiKeyError(undefined);
              }}
            />
          </div>
        ) : null}

        {wantsBaseUrl ? (
          <TextInput
            ref={baseUrlInput}
            label="Base URL"
            name="provider-base-url"
            value={baseUrl}
            spellCheck={false}
            inputMode="url"
            disabled={submitting}
            error={baseUrlError ?? null}
            hint={
              preset.isLocal
                ? "Local endpoints may use http on this machine."
                : "Hosted endpoints must use https."
            }
            placeholder="http://localhost:11434/v1"
            className="sm:col-span-2"
            onChange={(event) => {
              setBaseUrl(event.target.value);
              if (baseUrlError) setBaseUrlError(undefined);
            }}
          />
        ) : null}

        <div ref={modelShell} className="space-y-1.5">
          <SelectField
            label="Default model"
            value={model}
            disabled={submitting}
            error={model === CUSTOM_MODEL ? null : (modelError ?? null)}
            hint="The model id that answers your searches."
            onChange={(event) => {
              setModel(event.target.value);
              if (modelError) setModelError(undefined);
            }}
          >
            {preset.defaultModels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value={CUSTOM_MODEL}>Other model</option>
          </SelectField>
        </div>

        {model === CUSTOM_MODEL ? (
          <TextInput
            label="Model id"
            name="provider-model-id"
            value={customModel}
            spellCheck={false}
            disabled={submitting}
            error={modelError ?? null}
            hint="Exactly as the endpoint expects it."
            placeholder="llama3.2"
            onChange={(event) => {
              setCustomModel(event.target.value);
              if (modelError) setModelError(undefined);
            }}
          />
        ) : null}
      </div>

      {formError ? (
        <div role="alert">
          <Callout tone="danger" title="Provider was not added">
            {formError}
          </Callout>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={submitting}>
          Add provider
        </Button>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <p className="text-[12.5px] text-ink-faint">
          Test the connection after adding it, before search relies on it.
        </p>
      </div>
    </form>
  );
}
