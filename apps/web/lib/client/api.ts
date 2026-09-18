"use client";

import type {
  ApiAuditEvent,
  ApiFolder,
  ApiItem,
  ApiProvider,
  ApiRevision,
  ApiSearchResult,
  ApiSessionInfo,
  ApiSettings,
  ApiTag,
  ApiUser,
  ApiVaultKey,
  KdfParams,
  ProviderPreset,
} from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | undefined | null;

/**
 * The API runs as its own service, so the browser needs to know where to find
 * it. Left unset, requests go to whatever origin served the page, which is how
 * the single-container self-hosted bundle works.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function query(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      credentials: API_BASE_URL ? "include" : "same-origin",
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      "NETWORK",
      0,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      error?.message ?? `Request failed (${response.status})`,
      error?.code ?? "INTERNAL",
      response.status,
      error?.details,
    );
  }

  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);

export const api = {
  prelogin: (email: string) =>
    request<{ kdfParams: KdfParams }>(
      `/auth/prelogin?email=${encodeURIComponent(email)}`,
    ),

  register: (input: {
    email: string;
    authHash: string;
    kdfParams: KdfParams;
    protectedVaultKey: string;
  }) =>
    request<{ user: ApiUser; vault: ApiVaultKey }>("/auth/register", {
      method: "POST",
      body: json(input),
    }),

  login: (input: { email: string; authHash: string }) =>
    request<{ user: ApiUser; vault: ApiVaultKey }>("/auth/login", {
      method: "POST",
      body: json(input),
    }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  session: () =>
    request<{
      user: ApiUser;
      session: ApiSessionInfo;
      settings: ApiSettings;
      vault: ApiVaultKey;
    }>("/auth/session"),

  changePassword: (input: {
    currentAuthHash: string;
    authHash: string;
    kdfParams: KdfParams;
    protectedVaultKey: string;
  }) =>
    request<{ securityStamp: string; revokedSessions: number }>(
      "/auth/password",
      { method: "POST", body: json(input) },
    ),

  verifyMasterPassword: (authHash: string) =>
    request<{ ok: true }>("/auth/verify", {
      method: "POST",
      body: json({ authHash }),
    }),

  changeEmail: (input: { email: string; protectedVaultKey: string }) =>
    request<{ user: ApiUser; revokedSessions: number }>("/auth/email", {
      method: "POST",
      body: json(input),
    }),

  deleteAccount: (authHash: string) =>
    request<{ deleted: true }>("/auth/account", {
      method: "DELETE",
      body: json({ authHash }),
    }),

  sessions: () => request<{ sessions: ApiSessionInfo[] }>("/auth/sessions"),

  revokeSession: (id: string) =>
    request<{ ok: true }>(`/auth/sessions/${id}`, { method: "DELETE" }),

  /** Revokes every session, optionally including the caller's own. */
  revokeAllSessions: (input?: { includeCurrent?: boolean }) =>
    request<{ revoked: number }>("/auth/sessions/revoke-all", {
      method: "POST",
      body: json(input ?? {}),
    }),

  events: (params?: { limit?: number; before?: string }) =>
    request<{ events: ApiAuditEvent[]; nextCursor: string | null }>(
      `/auth/events${query(params)}`,
    ),

  items: (params?: {
    limit?: number;
    cursor?: string;
    type?: string;
    folderId?: string;
    tagId?: string;
    favorite?: boolean;
    includeTrashed?: boolean;
  }) =>
    request<{ items: ApiItem[]; nextCursor: string | null }>(
      `/vault/items${query(params)}`,
    ),

  item: (id: string) => request<{ item: ApiItem }>(`/vault/items/${id}`),

  itemRevisions: (id: string, params?: { limit?: number }) =>
    request<{ revisions: ApiRevision[] }>(
      `/vault/items/${id}/revisions${query(params)}`,
    ),

  createItem: (input: {
    id?: string;
    type: string;
    nameEnc: string;
    notesEnc?: string | null;
    dataEnc: string;
    folderId?: string | null;
    tagIds?: string[];
    favorite?: boolean;
    reprompt?: boolean;
  }) =>
    request<{ item: ApiItem }>("/vault/items", {
      method: "POST",
      body: json(input),
    }),

  /** Import path: one request for a whole file instead of one per item. */
  bulkCreateItem: (
    items: {
      id?: string;
      type: string;
      nameEnc: string;
      notesEnc?: string | null;
      dataEnc: string;
      folderId?: string | null;
      tagIds?: string[];
      favorite?: boolean;
      reprompt?: boolean;
    }[],
  ) =>
    request<{ items: ApiItem[] }>("/vault/items/bulk", {
      method: "POST",
      body: json({ items }),
    }),

  updateItem: (
    id: string,
    input: {
      revision: number;
      nameEnc?: string;
      notesEnc?: string | null;
      dataEnc?: string;
      folderId?: string | null;
      tagIds?: string[];
      favorite?: boolean;
      reprompt?: boolean;
    },
  ) =>
    request<{ item: ApiItem }>(`/vault/items/${id}`, {
      method: "PATCH",
      body: json(input),
    }),

  trashItem: (id: string) =>
    request<{ item: ApiItem }>(`/vault/items/${id}`, { method: "DELETE" }),

  restoreItem: (id: string) =>
    request<{ item: ApiItem }>(`/vault/items/${id}/restore`, {
      method: "POST",
    }),

  purgeItem: (id: string) =>
    request<{ ok: true }>(`/vault/items/${id}/purge`, { method: "DELETE" }),

  folders: () => request<{ folders: ApiFolder[] }>("/vault/folders"),

  createFolder: (nameEnc: string) =>
    request<{ folder: ApiFolder }>("/vault/folders", {
      method: "POST",
      body: json({ nameEnc }),
    }),

  updateFolder: (id: string, nameEnc: string) =>
    request<{ folder: ApiFolder }>(`/vault/folders/${id}`, {
      method: "PATCH",
      body: json({ nameEnc }),
    }),

  deleteFolder: (id: string) =>
    request<{ ok: true }>(`/vault/folders/${id}`, { method: "DELETE" }),

  tags: () => request<{ tags: ApiTag[] }>("/vault/tags"),

  createTag: (nameEnc: string) =>
    request<{ tag: ApiTag }>("/vault/tags", {
      method: "POST",
      body: json({ nameEnc }),
    }),

  renameTag: (id: string, nameEnc: string) =>
    request<{ tag: ApiTag }>(`/vault/tags/${id}`, {
      method: "PATCH",
      body: json({ nameEnc }),
    }),

  deleteTag: (id: string) =>
    request<{ ok: true }>(`/vault/tags/${id}`, { method: "DELETE" }),

  /** One request for a whole multi-select action instead of one per item. */
  bulkUpdateItems: (input: {
    action: "trash" | "restore" | "destroy" | "favorite" | "move";
    ids: string[];
    favorite?: boolean;
    folderId?: string | null;
  }) =>
    request<{ items: ApiItem[] }>("/vault/items/bulk-update", {
      method: "POST",
      body: json(input),
    }),

  providers: () =>
    request<{ providers: ApiProvider[]; presets: ProviderPreset[] }>(
      "/ai/providers",
    ),

  createProvider: (input: {
    presetId: string;
    label: string;
    apiKey?: string | null;
    baseUrl?: string | null;
    defaultModel?: string | null;
    zeroDataRetention?: boolean;
  }) =>
    request<{ provider: ApiProvider }>("/ai/providers", {
      method: "POST",
      body: json(input),
    }),

  updateProvider: (
    id: string,
    input: {
      label?: string;
      apiKey?: string | null;
      baseUrl?: string | null;
      defaultModel?: string | null;
      zeroDataRetention?: boolean;
    },
  ) =>
    request<{ provider: ApiProvider }>(`/ai/providers/${id}`, {
      method: "PATCH",
      body: json(input),
    }),

  deleteProvider: (id: string) =>
    request<{ ok: true }>(`/ai/providers/${id}`, { method: "DELETE" }),

  testProvider: (id: string) =>
    request<{ ok: true; presetId: string; modelId: string; latencyMs: number }>(
      `/ai/providers/${id}/test`,
      { method: "POST" },
    ),

  aiSettings: () => request<{ settings: ApiSettings }>("/ai/settings"),

  updateAiSettings: (input: {
    aiMode?: "local" | "cloud";
    defaultProviderId?: string | null;
  }) =>
    request<{ settings: ApiSettings }>("/ai/settings", {
      method: "PUT",
      body: json(input),
    }),

  search: (input: {
    query: string;
    mode: "local" | "cloud";
    providerId?: string;
    model?: string;
    candidates: { token: string; title: string; note?: string; domain?: string }[];
  }) =>
    request<ApiSearchResult>("/ai/search", {
      method: "POST",
      body: json(input),
    }),

  pwnedRange: (prefix: string) =>
    request<{ prefix: string; suffixes: string; cached: boolean }>(
      `/pwned/range?prefix=${prefix}`,
    ),

  /** Batch form for the health dashboard: one round trip for the whole vault. */
  pwnedRanges: (prefixes: string[]) =>
    request<{
      ranges: { prefix: string; suffixes: string; cached: boolean }[];
    }>("/pwned/range", {
      method: "POST",
      body: json({ prefixes }),
    }),
};
