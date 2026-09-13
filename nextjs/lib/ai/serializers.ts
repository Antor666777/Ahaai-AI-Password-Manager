import type { AiProvider } from "@/lib/db/schema";
import { decryptApiKey, maskApiKey } from "./crypto";

export interface PublicProvider {
  id: string;
  presetId: string;
  label: string;
  baseUrl: string | null;
  defaultModel: string | null;
  isLocal: boolean;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Never returns the plaintext API key, only a masked preview. */
export function toPublicProvider(provider: AiProvider): PublicProvider {
  let apiKeyMask: string | null = null;
  if (provider.apiKeyEnc) {
    try {
      apiKeyMask = maskApiKey(decryptApiKey(provider.apiKeyEnc));
    } catch {
      apiKeyMask = "********";
    }
  }

  return {
    id: provider.id,
    presetId: provider.presetId,
    label: provider.label,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    isLocal: provider.isLocal,
    hasApiKey: provider.apiKeyEnc !== null,
    apiKeyMask,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}
