import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const itemTypeEnum = pgEnum("item_type", [
  "login",
  "card",
  "identity",
  "secure_note",
]);

export const aiModeEnum = pgEnum("ai_mode", ["local", "cloud"]);

/**
 * Client-side KDF configuration. The salt is random per user and generated in
 * the browser; the server only stores it so returning clients can re-derive.
 */
export interface KdfParams {
  algo: "argon2id";
  version: number;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  /** base64-encoded 16-byte salt */
  salt: string;
}

/** Server-side hashing parameters applied to the client auth hash. */
export interface ServerAuthParams {
  algo: "argon2id";
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    authHash: text("auth_hash").notNull(),
    authSalt: text("auth_salt").notNull(),
    authParams: jsonb("auth_params").$type<ServerAuthParams>().notNull(),
    kdfParams: jsonb("kdf_params").$type<KdfParams>().notNull(),
    kdfVersion: integer("kdf_version").notNull().default(1),
    protectedVaultKey: text("protected_vault_key").notNull(),
    recoveryProtectedVaultKey: text("recovery_protected_vault_key"),
    securityStamp: text("security_stamp").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("users_email_normalized_key").on(table.emailNormalized)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    previousTokenHash: text("previous_token_hash"),
    deviceName: text("device_name"),
    deviceType: text("device_type"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt,
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_key").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt,
  },
  (table) => [
    index("security_events_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nameEnc: text("name_enc").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("folders_user_id_idx").on(table.userId)],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: itemTypeEnum("type").notNull(),
    nameEnc: text("name_enc").notNull(),
    notesEnc: text("notes_enc"),
    dataEnc: text("data_enc").notNull(),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    favorite: boolean("favorite").notNull().default(false),
    reprompt: boolean("reprompt").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("items_user_deleted_idx").on(table.userId, table.deletedAt),
    index("items_folder_id_idx").on(table.folderId),
  ],
);

/**
 * A user-defined label. The name is sealed in the browser, so only ciphertext
 * is stored and there is deliberately no server-side uniqueness: de-duplication
 * by name happens client-side after decryption, exactly like folder names.
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nameEnc: text("name_enc").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("tags_user_id_idx").on(table.userId)],
);

/**
 * The many-to-many link between items and tags. Deleting either side cascades
 * this row away, so a tag delete detaches from items without touching them.
 */
export const itemTags = pgTable(
  "item_tags",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("item_tags_tag_id_idx").on(table.tagId),
  ],
);

/**
 * A snapshot of an item's ciphertext, written just before an update overwrites
 * it. The envelope AAD binds to the item id and the field, never to the
 * revision, so a stored snapshot stays decryptable verbatim and restoring one
 * is an ordinary PATCH rather than a re-seal.
 */
export const itemRevisions = pgTable(
  "item_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The revision this snapshot held before an update replaced it. */
    revision: integer("revision").notNull(),
    nameEnc: text("name_enc").notNull(),
    notesEnc: text("notes_enc"),
    dataEnc: text("data_enc").notNull(),
    createdAt,
  },
  (table) => [
    // Revisions per item are strictly increasing, so this is a real invariant.
    uniqueIndex("item_revisions_item_revision_key").on(
      table.itemId,
      table.revision,
    ),
    index("item_revisions_user_id_idx").on(table.userId),
  ],
);

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    presetId: text("preset_id").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url"),
    apiKeyEnc: text("api_key_enc"),
    defaultModel: text("default_model"),
    isLocal: boolean("is_local").notNull().default(false),
    /**
     * Ask Vercel for Zero Data Retention (and no prompt training) on this
     * provider's evaluation calls. Defaults on, because a password manager
     * should not retain search context. Some plans reject it with a 403, so it
     * is a per-provider switch rather than a hard requirement.
     */
    zeroDataRetention: boolean("zero_data_retention").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("ai_providers_user_preset_label_key").on(
      table.userId,
      table.presetId,
      table.label,
    ),
    index("ai_providers_user_id_idx").on(table.userId),
  ],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  aiMode: aiModeEnum("ai_mode").notNull().default("cloud"),
  defaultProviderId: uuid("default_provider_id").references(
    () => aiProviders.id,
    { onDelete: "set null" },
  ),
  updatedAt,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type ItemTag = typeof itemTags.$inferSelect;
export type NewItemTag = typeof itemTags.$inferInsert;
export type ItemRevision = typeof itemRevisions.$inferSelect;
export type NewItemRevision = typeof itemRevisions.$inferInsert;
export type AiProvider = typeof aiProviders.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type AiMode = (typeof aiModeEnum.enumValues)[number];
