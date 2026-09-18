import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGateway } from "@ai-sdk/gateway";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AiMode, AiProvider } from "@ahaai/db/schema";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";
import { getSettings } from "@ahaai/core/settings";
import { decryptApiKey } from "./crypto";
import {
  PROVIDER_PRESETS,
  getPreset,
  isEvaluationPreset,
  isLanguagePreset,
  type ProviderPreset,
} from "./presets";
import { getProvider, listProviders } from "./service";
import { assertSafeBaseUrl } from "./url-guard";

export interface ResolvedModel {
  presetId: string;
  modelId: string;
  isLocal: boolean;
  source: "database" | "environment";
  model: LanguageModel;
}

export interface ResolveOptions {
  providerId?: string | null;
  model?: string | null;
  mode?: AiMode;
}

interface ModelConfig {
  apiKey?: string;
  baseUrl?: string;
  modelId: string;
}

/** OpenAI exposes `.chat()`; other providers are directly callable. */
function callable(provider: unknown, modelId: string): LanguageModel {
  const candidate = provider as {
    chat?: (id: string) => LanguageModel;
  } & ((id: string) => LanguageModel);

  if (typeof candidate.chat === "function") return candidate.chat(modelId);
  return candidate(modelId);
}

function buildModel(preset: ProviderPreset, config: ModelConfig): LanguageModel {
  const { apiKey, baseUrl, modelId } = config;

  switch (preset.kind) {
    case "openai":
      return callable(createOpenAI({ apiKey, baseURL: baseUrl }), modelId);
    case "anthropic":
      return callable(createAnthropic({ apiKey, baseURL: baseUrl }), modelId);
    case "google":
      return callable(createGoogle({ apiKey, baseURL: baseUrl }), modelId);
    case "groq":
      return callable(createGroq({ apiKey, baseURL: baseUrl }), modelId);
    case "mistral":
      return callable(createMistral({ apiKey, baseURL: baseUrl }), modelId);
    case "azure":
      return callable(createAzure({ apiKey, baseURL: baseUrl }), modelId);
    case "openai-compatible": {
      if (!baseUrl) {
        throw AppError.badRequest("This provider requires a base URL");
      }
      return callable(
        createOpenAICompatible({
          name: preset.id,
          baseURL: baseUrl,
          apiKey: apiKey ?? "",
        }),
        modelId,
      );
    }
    case "gateway":
      // Evaluation models answer typed questions; they never generate text, so
      // a language request must not be routed to one.
      throw AppError.badRequest(
        "This provider answers evaluation questions and cannot generate text",
      );
  }
}

/** The preset behind a saved row, but only when it is a language model. */
function languagePreset(presetId: string): ProviderPreset | undefined {
  const preset = getPreset(presetId);
  return preset && isLanguagePreset(preset) ? preset : undefined;
}

/** The preset behind a saved row, but only when it is an evaluation model. */
function evaluationPreset(presetId: string): ProviderPreset | undefined {
  const preset = getPreset(presetId);
  return preset && isEvaluationPreset(preset) ? preset : undefined;
}

function pickEnvPreset(): { preset: ProviderPreset; apiKey: string } | null {
  for (const preset of PROVIDER_PRESETS) {
    if (preset.isLocal || !preset.envKey || !isLanguagePreset(preset)) continue;
    const value = process.env[preset.envKey];
    if (value) return { preset, apiKey: value };
  }
  return null;
}

/**
 * Resolves the model a request should use, honouring the local/cloud toggle.
 * Credentials come from the user's BYOK provider row, falling back to an
 * environment key for self-hosted installs.
 */
export async function resolveLanguageModel(
  db: Database,
  userId: string,
  options: ResolveOptions = {},
): Promise<ResolvedModel> {
  const settings = await getSettings(db, userId);
  const desiredLocal =
    options.mode === "local" ? true : options.mode === "cloud" ? false : undefined;

  let row: AiProvider | undefined;

  // An explicit provider is only a preference. If it does not match the
  // requested mode, fall through to one that does instead of refusing.
  if (options.providerId) {
    const candidate = await getProvider(db, userId, options.providerId);
    if (
      languagePreset(candidate.presetId) &&
      (desiredLocal === undefined || candidate.isLocal === desiredLocal)
    ) {
      row = candidate;
    }
  }

  // Prefer the saved default among the providers that match the mode.
  if (!row && desiredLocal !== undefined) {
    const providers = await listProviders(db, userId);
    const matching = providers.filter(
      (p) => p.isLocal === desiredLocal && languagePreset(p.presetId),
    );
    row =
      matching.find((p) => p.id === settings.defaultProviderId) ?? matching[0];
  }

  if (!row && desiredLocal === undefined && settings.defaultProviderId) {
    const candidate = await getProvider(db, userId, settings.defaultProviderId);
    if (languagePreset(candidate.presetId)) row = candidate;
  }

  let preset: ProviderPreset | undefined;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let modelId: string | undefined;
  let isLocal = false;
  let source: ResolvedModel["source"] = "database";

  if (row) {
    preset = getPreset(row.presetId);
    if (!preset) throw AppError.badRequest("Unknown provider preset");

    isLocal = row.isLocal;
    baseUrl = row.baseUrl ?? preset.baseUrl ?? undefined;
    if (row.apiKeyEnc) {
      apiKey = decryptApiKey(row.apiKeyEnc);
    } else if (preset.envKey) {
      apiKey = process.env[preset.envKey];
    }
    modelId = options.model ?? row.defaultModel ?? preset.defaultModels[0];
  } else {
    // Environment keys only ever cover cloud providers, and never satisfy a
    // request that asked for a local one.
    if (desiredLocal === true) {
      throw AppError.badRequest(
        "Local mode needs a model running on this machine, and no local provider is set up. Add Ollama, LM Studio, or vLLM in settings, or switch the search to cloud.",
        { reason: "no_matching_provider", mode: "local", alternativeMode: "cloud" },
      );
    }

    const fallback = pickEnvPreset();
    if (!fallback) {
      if (desiredLocal === false) {
        throw AppError.badRequest(
          "Cloud mode needs a hosted provider, and none is set up. Add one in settings, or switch the search to local.",
          {
            reason: "no_matching_provider",
            mode: "cloud",
            alternativeMode: "local",
          },
        );
      }
      throw AppError.badRequest(
        "No AI provider is set up. Add one in settings, then search again.",
      );
    }
    preset = fallback.preset;
    apiKey = fallback.apiKey;
    baseUrl = preset.baseUrl;
    isLocal = preset.isLocal;
    modelId = options.model ?? preset.defaultModels[0];
    source = "environment";
  }

  if (!preset) throw AppError.badRequest("Unknown provider preset");
  if (preset.requiresKey && !apiKey) {
    throw AppError.badRequest("This provider is missing an API key");
  }
  if (baseUrl) assertSafeBaseUrl(baseUrl, isLocal);
  if (!modelId) {
    throw AppError.badRequest("A model id is required for this provider");
  }

  return {
    presetId: preset.id,
    modelId,
    isLocal,
    source,
    model: buildModel(preset, { apiKey, baseUrl, modelId }),
  };
}

/**
 * The model type `experimental_evaluate` accepts. Derived from the Gateway
 * factory so the app does not depend on the provider type package directly.
 */
export type EvaluationModel = ReturnType<
  ReturnType<typeof createGateway>["evaluationModel"]
>;

export interface ResolvedEvaluationModel {
  presetId: string;
  modelId: string;
  isLocal: false;
  source: "database" | "environment";
  /** Whether this provider asked for zero retention and no training. */
  zeroDataRetention: boolean;
  model: EvaluationModel;
}

function buildEvaluationModel(
  preset: ProviderPreset,
  config: { apiKey?: string; modelId: string },
): EvaluationModel {
  if (preset.kind !== "gateway") {
    throw AppError.badRequest("This provider cannot answer evaluation questions");
  }
  // Gateway reads this key per request; it is never part of the evaluated state.
  return createGateway({ apiKey: config.apiKey }).evaluationModel(config.modelId);
}

/**
 * Resolves a model that answers typed evaluation questions, or `null` when the
 * user has not set one up. A search treats this as an optional accelerator:
 * returning `null` sends the request down the ordinary language-model path
 * instead of failing it, and evaluation is cloud-only because it always calls a
 * hosted decision model.
 */
export async function resolveEvaluationModel(
  db: Database,
  userId: string,
  options: ResolveOptions = {},
): Promise<ResolvedEvaluationModel | null> {
  const settings = await getSettings(db, userId);

  let row: AiProvider | undefined;

  if (options.providerId) {
    const candidate = await getProvider(db, userId, options.providerId).catch(
      () => undefined,
    );
    if (candidate && evaluationPreset(candidate.presetId)) row = candidate;
  }

  if (!row) {
    const providers = await listProviders(db, userId);
    const matching = providers.filter(
      (p) => !p.isLocal && evaluationPreset(p.presetId),
    );
    row = matching.find((p) => p.id === settings.defaultProviderId) ?? matching[0];
  }

  if (row) {
    const preset = getPreset(row.presetId);
    if (!preset) return null;

    const apiKey = row.apiKeyEnc
      ? decryptApiKey(row.apiKeyEnc)
      : preset.envKey
        ? process.env[preset.envKey]
        : undefined;
    const modelId = options.model ?? row.defaultModel ?? preset.defaultModels[0];
    if (preset.requiresKey && !apiKey) return null;
    if (!modelId) return null;

    return {
      presetId: preset.id,
      modelId,
      isLocal: false,
      source: "database",
      zeroDataRetention: row.zeroDataRetention,
      model: buildEvaluationModel(preset, { apiKey, modelId }),
    };
  }

  // Nothing saved: a self-hosted install can still supply a gateway key.
  const preset = PROVIDER_PRESETS.find(
    (entry) => isEvaluationPreset(entry) && entry.envKey,
  );
  const apiKey = preset?.envKey ? process.env[preset.envKey] : undefined;
  if (!preset || !apiKey) return null;

  const modelId = options.model ?? preset.defaultModels[0];
  if (!modelId) return null;

  return {
    presetId: preset.id,
    modelId,
    isLocal: false,
    source: "environment",
    // No saved row to carry a preference, so the environment keeps the default.
    zeroDataRetention: true,
    model: buildEvaluationModel(preset, { apiKey, modelId }),
  };
}
