import { generateText } from "ai";
import type { Database } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { resolveLanguageModel } from "./resolve";

export interface ProviderTestResult {
  ok: true;
  presetId: string;
  modelId: string;
  latencyMs: number;
}

/** Sends a minimal prompt to verify the provider credentials work. */
export async function testProviderConnection(
  db: Database,
  userId: string,
  providerId: string,
): Promise<ProviderTestResult> {
  const resolved = await resolveLanguageModel(db, userId, { providerId });
  const started = Date.now();

  try {
    await generateText({
      model: resolved.model,
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 5,
    });
  } catch (error) {
    throw AppError.upstream(
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
