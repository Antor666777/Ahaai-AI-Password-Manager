import { z } from "zod";
import {
  booleanStringSchema,
  envelopeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@ahaai/core/http/schemas";

export const itemTypeSchema = z.enum([
  "login",
  "card",
  "identity",
  "secure_note",
]);

export const createItemSchema = z.object({
  /** Client-generated so per-item AAD can bind ciphertext to the item. */
  id: uuidSchema.optional(),
  type: itemTypeSchema,
  nameEnc: envelopeSchema,
  notesEnc: envelopeSchema.nullable().optional(),
  dataEnc: envelopeSchema,
  folderId: uuidSchema.nullable().optional(),
  favorite: z.boolean().optional(),
  reprompt: z.boolean().optional(),
});

/**
 * Bulk import: one to five hundred items, each identical to a single create
 * (client-supplied id included, so per-item AAD still binds). The ids within a
 * request must be unique; two rows sharing one would otherwise reach the
 * primary key and fail the whole batch with a 500 instead of a 400.
 */
export const bulkCreateSchema = z
  .object({
    items: z.array(createItemSchema).min(1).max(500),
  })
  .refine(
    (value) => {
      const ids = value.items
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));
      return new Set(ids).size === ids.length;
    },
    { message: "Item ids must be unique within a request", path: ["items"] },
  );

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

/** `<ISO createdAt>|<item id>`; decoded and validated in `listItems`. */
const listCursorSchema = z.string().min(2).max(128);

export const listItemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: listCursorSchema.optional(),
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
