import { z } from "zod";
import { uuidSchema } from "@/lib/http/schemas";

export const providerPresetIdSchema = z.string().min(1).max(64);
export const providerLabelSchema = z.string().trim().min(1).max(80);
export const providerModelSchema = z.string().trim().min(1).max(200);
export const providerApiKeySchema = z.string().min(1).max(4096);

export const createProviderSchema = z.object({
  presetId: providerPresetIdSchema,
  label: providerLabelSchema,
  baseUrl: z.string().url().max(2048).nullable().optional(),
  apiKey: providerApiKeySchema.nullable().optional(),
  defaultModel: providerModelSchema.nullable().optional(),
  isLocal: z.boolean().optional(),
});

export const updateProviderSchema = z
  .object({
    label: providerLabelSchema.optional(),
    baseUrl: z.string().url().max(2048).nullable().optional(),
    apiKey: providerApiKeySchema.nullable().optional(),
    defaultModel: providerModelSchema.nullable().optional(),
    isLocal: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Provide at least one field to update" },
  );

export const updateSettingsSchema = z
  .object({
    aiMode: z.enum(["local", "cloud"]).optional(),
    defaultProviderId: uuidSchema.nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Provide at least one field to update" },
  );
