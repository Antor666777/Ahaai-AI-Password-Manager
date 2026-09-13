import { z } from "zod";
import {
  booleanStringSchema,
  envelopeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/http/schemas";

export const itemTypeSchema = z.enum([
  "login",
  "card",
  "identity",
  "secure_note",
]);

export const createItemSchema = z.object({
  type: itemTypeSchema,
  nameEnc: envelopeSchema,
  notesEnc: envelopeSchema.nullable().optional(),
  dataEnc: envelopeSchema,
  folderId: uuidSchema.nullable().optional(),
  favorite: z.boolean().optional(),
  reprompt: z.boolean().optional(),
});

export const updateItemSchema = z
  .object({
    revision: z.number().int().min(1),
    nameEnc: envelopeSchema.optional(),
    notesEnc: envelopeSchema.nullable().optional(),
    dataEnc: envelopeSchema.optional(),
    folderId: uuidSchema.nullable().optional(),
    favorite: z.boolean().optional(),
    reprompt: z.boolean().optional(),
  })
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, entry]) => key !== "revision" && entry !== undefined,
      ),
    { message: "Provide at least one field to update" },
  );

export const listItemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: isoDateStringSchema.optional(),
  type: itemTypeSchema.optional(),
  folderId: uuidSchema.optional(),
  favorite: booleanStringSchema.optional(),
  includeTrashed: booleanStringSchema.optional(),
});

export const syncQuerySchema = z.object({
  since: isoDateStringSchema.optional(),
});

export const folderCreateSchema = z.object({
  nameEnc: envelopeSchema,
});

export const folderUpdateSchema = z.object({
  nameEnc: envelopeSchema,
});
