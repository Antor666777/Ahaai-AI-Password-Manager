import { and, eq } from "drizzle-orm";
import type { AiMode, AiProvider } from "@/lib/db/schema";
import { aiProviders, userSettings } from "@/lib/db/schema";
import type { Database } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import {
  ensureSettings,
  getSettings,
  type SettingsView,
} from "@/lib/settings";
import { encryptApiKey } from "./crypto";
import { getPreset } from "./presets";
import { assertSafeBaseUrl } from "./url-guard";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code?: unknown }).code === UNIQUE_VIOLATION
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function listProviders(
  db: Database,
  userId: string,
): Promise<AiProvider[]> {
  return db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.userId, userId))
    .orderBy(aiProviders.createdAt);
}

export async function getProvider(
  db: Database,
  userId: string,
  providerId: string,
): Promise<AiProvider> {
  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
    .limit(1);
  if (!row) throw AppError.notFound("Provider not found");
  return row;
}

export interface ProviderInput {
  presetId: string;
  label: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  defaultModel?: string | null;
  isLocal?: boolean;
}

export async function createProvider(
  db: Database,
  userId: string,
  input: ProviderInput,
): Promise<AiProvider> {
  const preset = getPreset(input.presetId);
  if (!preset) throw AppError.badRequest("Unknown provider preset");

  const isLocal = input.isLocal ?? preset.isLocal;
  const baseUrl = input.baseUrl ?? preset.baseUrl ?? null;
  if (baseUrl) assertSafeBaseUrl(baseUrl, isLocal);
  if (preset.requiresKey && !input.apiKey) {
    throw AppError.badRequest("This provider requires an API key");
  }

  try {
    const [row] = await db
      .insert(aiProviders)
      .values({
        userId,
        presetId: preset.id,
        label: input.label,
        baseUrl,
        apiKeyEnc: input.apiKey ? encryptApiKey(input.apiKey) : null,
        defaultModel: input.defaultModel ?? preset.defaultModels[0] ?? null,
        isLocal,
      })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(
        "A provider with this preset and label already exists",
      );
    }
    throw error;
  }
}

export interface ProviderUpdateInput {
  label?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  defaultModel?: string | null;
  isLocal?: boolean;
}

export async function updateProvider(
  db: Database,
  userId: string,
  providerId: string,
  input: ProviderUpdateInput,
): Promise<AiProvider> {
  const current = await getProvider(db, userId, providerId);
  const preset = getPreset(current.presetId);

  const isLocal = input.isLocal ?? current.isLocal;
  const baseUrl =
    input.baseUrl !== undefined ? input.baseUrl : current.baseUrl;
  if (baseUrl) assertSafeBaseUrl(baseUrl, isLocal);

  const patch: Partial<typeof aiProviders.$inferInsert> = {
    isLocal,
    updatedAt: new Date(),
  };
  if (input.label !== undefined) patch.label = input.label;
  if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl;
  if (input.defaultModel !== undefined) patch.defaultModel = input.defaultModel;
  if (input.apiKey !== undefined) {
    patch.apiKeyEnc = input.apiKey === null ? null : encryptApiKey(input.apiKey);
  }

  if (preset?.requiresKey && patch.apiKeyEnc === null) {
    throw AppError.badRequest("This provider requires an API key");
  }

  try {
    const [row] = await db
      .update(aiProviders)
      .set(patch)
      .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
      .returning();
    if (!row) throw AppError.notFound("Provider not found");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(
        "A provider with this preset and label already exists",
      );
    }
    throw error;
  }
}

export async function deleteProvider(
  db: Database,
  userId: string,
  providerId: string,
): Promise<void> {
  const deleted = await db
    .delete(aiProviders)
    .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
    .returning({ id: aiProviders.id });

  if (deleted.length === 0) throw AppError.notFound("Provider not found");
}

export interface UpdateSettingsInput {
  aiMode?: AiMode;
  defaultProviderId?: string | null;
}

export async function updateAiSettings(
  db: Database,
  userId: string,
  input: UpdateSettingsInput,
): Promise<SettingsView> {
  await ensureSettings(db, userId);

  if (input.defaultProviderId) {
    // Throws if the provider is not owned by this user.
    await getProvider(db, userId, input.defaultProviderId);
  }

  const patch: Partial<typeof userSettings.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.aiMode !== undefined) patch.aiMode = input.aiMode;
  if (input.defaultProviderId !== undefined) {
    patch.defaultProviderId = input.defaultProviderId;
  }

  await db.update(userSettings).set(patch).where(eq(userSettings.userId, userId));
  return getSettings(db, userId);
}

export async function getAiSettings(
  db: Database,
  userId: string,
): Promise<SettingsView> {
  return getSettings(db, userId);
}
