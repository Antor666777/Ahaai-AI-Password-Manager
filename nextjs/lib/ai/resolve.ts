import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AiMode } from "@/lib/db/schema";
import type { Database } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { getSettings } from "@/lib/settings";
import { decryptApiKey } from "./crypto";
import { PROVIDER_PRESETS, getPreset, type ProviderPreset } from "./presets";
import { getProvider } from "./service";
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
  }
}

function pickEnvPreset(): { preset: ProviderPreset; apiKey: string } | null {
  for (const preset of PROVIDER_PRESETS) {
    if (preset.isLocal || !preset.envKey) continue;
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
  const providerId = options.providerId ?? settings.defaultProviderId ?? undefined;

  let preset: ProviderPreset | undefined;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let modelId: string | undefined;
  let isLocal = false;
  let source: ResolvedModel["source"] = "database";

  if (providerId) {
    const row = await getProvider(db, userId, providerId);
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
    const fallback = pickEnvPreset();
    if (!fallback) {
      throw AppError.badRequest(
        "No AI provider is configured. Add one in AI settings.",
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

  if (options.mode === "local" && !isLocal) {
    throw AppError.badRequest(
      "Selected provider is not local. Switch to cloud mode or choose a local provider.",
    );
  }
  if (options.mode === "cloud" && isLocal) {
    throw AppError.badRequest(
      "Selected provider is local. Switch to local mode.",
    );
  }

  return {
    presetId: preset.id,
    modelId,
    isLocal,
    source,
    model: buildModel(preset, { apiKey, baseUrl, modelId }),
  };
}
