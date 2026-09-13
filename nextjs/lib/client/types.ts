import type { AiMode, ItemType } from "@/lib/db/schema";

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

export interface ApiProvider {
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

export interface ApiSearchMatch {
  token: string;
  reason: string;
  score: number;
}

export interface ApiSearchResult {
  matches: ApiSearchMatch[];
  modelId: string;
  presetId: string;
  isLocal: boolean;
  mode: AiMode;
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
