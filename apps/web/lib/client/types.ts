import type { AiMode, ItemType } from "@ahaai/db/schema";

export type { AiMode, ItemType };

export interface KdfParams {
  algo: "argon2id";
  version: number;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

export interface ApiUser {
  id: string;
  email: string;
  emailVerified: boolean;
  securityStamp: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ApiVaultKey {
  protectedVaultKey: string;
  kdfParams: KdfParams;
}

export interface ApiItem {
  id: string;
  type: ItemType;
  nameEnc: string;
  notesEnc: string | null;
  dataEnc: string;
  folderId: string | null;
  /** Ids of the tags assigned to this item. Tags are relational, not sealed. */
  tagIds: string[];
  favorite: boolean;
  reprompt: boolean;
  revision: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiFolder {
  id: string;
  nameEnc: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTag {
  id: string;
  nameEnc: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A snapshot of an item's ciphertext, written just before an update overwrites
 * it. The field AAD binds to the item id and not to the revision, so a stored
 * snapshot stays decryptable verbatim and can be restored by a normal item
 * update rather than a re-seal.
 */
export interface ApiRevision {
  id: string;
  itemId: string;
  /** The revision this snapshot held before the update replaced it. */
  revision: number;
  nameEnc: string;
  notesEnc: string | null;
  dataEnc: string;
  createdAt: string;
}

export interface ApiProvider {
  id: string;
  presetId: string;
  label: string;
  baseUrl: string | null;
  defaultModel: string | null;
  isLocal: boolean;
  /** Whether evaluation calls ask the gateway for zero retention. */
  zeroDataRetention: boolean;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  kind: string;
  baseUrl?: string;
  defaultModels: string[];
  isLocal: boolean;
  requiresKey: boolean;
  /** A key is not required, but the field is offered anyway. */
  keyOptional: boolean;
  /** Absent means a language model; `evaluation` is a decision model. */
  capability?: "language" | "evaluation";
}

export interface ApiSettings {
  aiMode: AiMode;
  defaultProviderId: string | null;
  updatedAt: string | null;
}

export interface ApiSessionInfo {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface ApiAuditEvent {
  id: string;
  type: string;
  severity: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** How sure the search is that a returned credential is the one you meant. */
export type MatchConfidence = "strong" | "possible";

export interface ApiSearchMatch {
  token: string;
  reason: string;
  score: number;
  confidence: MatchConfidence;
}

export interface ApiSearchResult {
  matches: ApiSearchMatch[];
  modelId: string;
  presetId: string;
  isLocal: boolean;
  mode: AiMode;
  /** `evaluation` means a decision model ranked the results. */
  engine?: "evaluation" | "language";
  intent?: string;
  /** Whether the decision model ran with zero retention. */
  zeroDataRetention?: boolean;
  /** How many candidates the decision engine was asked about. */
  shortlistCount?: number;
  truncated: boolean;
}

export interface CustomField {
  label: string;
  value: string;
  secret?: boolean;
}

export interface LoginPayload {
  username?: string;
  password?: string;
  /**
   * A normalized `otpauth://` descriptor for the shared secret. Keeping the URI
   * instead of a bare base32 string preserves custom digits/period/algorithm,
   * which would otherwise generate the wrong code. Live codes stay local.
   */
  totpUri?: string;
  /** Legacy: a rotating code stored before real TOTP existed. Read-only. */
  totp?: string;
  urls?: string[];
  custom?: CustomField[];
}

export interface CardPayload {
  holder?: string;
  number?: string;
  expiry?: string;
  cvv?: string;
  brand?: string;
}

export interface IdentityPayload {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface SecureNotePayload {
  body?: string;
}

export type ItemPayload =
  | LoginPayload
  | CardPayload
  | IdentityPayload
  | SecureNotePayload;

export interface DecryptedItem {
  id: string;
  type: ItemType;
  name: string;
  notes: string;
  data: ItemPayload;
  folderId: string | null;
  tagIds: string[];
  favorite: boolean;
  reprompt: boolean;
  revision: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedFolder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedTag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
