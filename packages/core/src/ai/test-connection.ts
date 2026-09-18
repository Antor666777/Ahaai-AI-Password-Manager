import { generateText } from "ai";
import type { Database } from "@ahaai/db/types";
import { AppError } from "@ahaai/core/http/errors";
import { probeEvaluationModel } from "./evaluate";
import { upstreamFailure } from "./failure";
import { getPreset, isEvaluationPreset } from "./presets";
import { resolveEvaluationModel, resolveLanguageModel } from "./resolve";
import { getProvider } from "./service";

export interface ProviderTestResult {
  ok: true;
  presetId: string;
  modelId: string;
  latencyMs: number;
}

/** Sends a minimal request to verify the provider credentials work. */
export async function testProviderConnection(
  db: Database,
  userId: string,
  providerId: string,
): Promise<ProviderTestResult> {
  const provider = await getProvider(db, userId, providerId);
  const preset = getPreset(provider.presetId);
  const started = Date.now();

  // A decision model answers questions rather than text, so it needs its own
  // probe; a generate call would fail against a provider that never generates.
  if (preset && isEvaluationPreset(preset)) {
    const resolved = await resolveEvaluationModel(db, userId, { providerId });
    if (!resolved) {
      throw AppError.badRequest("This provider is missing the settings it needs");
    }

    try {
      await probeEvaluationModel(resolved.model, resolved.zeroDataRetention);
    } catch (error) {
      throw upstreamFailure(
        "Could not reach the provider with these settings",
        error,
      );
    }

    return {
      ok: true,
      presetId: resolved.presetId,
      modelId: resolved.modelId,
      latencyMs: Date.now() - started,
    };
  }

  const resolved = await resolveLanguageModel(db, userId, { providerId });

  try {
    await generateText({
      model: resolved.model,
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 5,
    });
  } catch (error) {
    throw upstreamFailure(
      "Could not reach the provider with these settings",
      error,
    );
  }

  return {
    ok: true,
    presetId: resolved.presetId,
    modelId: resolved.modelId,
    latencyMs: Date.now() - started,
  };
}
