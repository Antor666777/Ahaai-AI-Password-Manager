import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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
export type AiProvider = typeof aiProviders.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type AiMode = (typeof aiModeEnum.enumValues)[number];
