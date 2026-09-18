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
  tagIds: z.array(uuidSchema).optional(),
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

/** One to five hundred item ids, the batch every bulk action operates on. */
const bulkItemIdsSchema = z.array(uuidSchema).min(1).max(500);

/**
 * Bulk action over a set of items. Modelled as a discriminated union on
 * `action` so an unknown action, or a `favorite`/`move` payload missing its
 * required field, is a 400 at the boundary instead of a branch the service has
 * to defend. The ids must be unique, mirroring `bulkCreateSchema`.
 */
export const bulkUpdateSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("trash"), ids: bulkItemIdsSchema }),
    z.object({ action: z.literal("restore"), ids: bulkItemIdsSchema }),
    z.object({ action: z.literal("destroy"), ids: bulkItemIdsSchema }),
    z.object({
      action: z.literal("favorite"),
      ids: bulkItemIdsSchema,
      favorite: z.boolean(),
    }),
    z.object({
      action: z.literal("move"),
      ids: bulkItemIdsSchema,
      // A null folder is a valid "unfile"; only a real folder is ownership
      // checked, in the service.
      folderId: uuidSchema.nullable(),
    }),
  ])
  .refine(
    (value) => new Set(value.ids).size === value.ids.length,
    { message: "Item ids must be unique within a request", path: ["ids"] },
  );

export type BulkUpdateBody = z.infer<typeof bulkUpdateSchema>;

export const updateItemSchema = z
  .object({
    revision: z.number().int().min(1),
    nameEnc: envelopeSchema.optional(),
    notesEnc: envelopeSchema.nullable().optional(),
    dataEnc: envelopeSchema.optional(),
    folderId: uuidSchema.nullable().optional(),
    tagIds: z.array(uuidSchema).optional(),
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
  tagId: uuidSchema.optional(),
  favorite: booleanStringSchema.optional(),
  includeTrashed: booleanStringSchema.optional(),
});

export const syncQuerySchema = z.object({
  since: isoDateStringSchema.optional(),
  tagId: uuidSchema.optional(),
});

/** History reads: default to the full kept window, never more than the cap. */
export const listItemRevisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const folderCreateSchema = z.object({
  nameEnc: envelopeSchema,
});

export const folderUpdateSchema = z.object({
  nameEnc: envelopeSchema,
});

export const tagCreateSchema = z.object({
  nameEnc: envelopeSchema,
});

export const tagUpdateSchema = z.object({
  nameEnc: envelopeSchema,
});
