"use client";

import type {
  ApiAuditEvent,
  ApiFolder,
  ApiItem,
  ApiProvider,
  ApiSearchResult,
  ApiSessionInfo,
  ApiSettings,
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
    response = await fetch(path, {
      credentials: "same-origin",
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
      `/api/auth/prelogin?email=${encodeURIComponent(email)}`,
    ),

  register: (input: {
    email: string;
    authHash: string;
    kdfParams: KdfParams;
    protectedVaultKey: string;
  }) =>
    request<{ user: ApiUser; vault: ApiVaultKey }>("/api/auth/register", {
      method: "POST",
      body: json(input),
    }),

  login: (input: { email: string; authHash: string }) =>
    request<{ user: ApiUser; vault: ApiVaultKey }>("/api/auth/login", {
      method: "POST",
      body: json(input),
    }),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  session: () =>
    request<{
      user: ApiUser;
      session: ApiSessionInfo;
      settings: ApiSettings;
      vault: ApiVaultKey;
    }>("/api/auth/session"),

  changePassword: (input: {
    currentAuthHash: string;
    authHash: string;
    kdfParams: KdfParams;
    protectedVaultKey: string;
  }) =>
    request<{ securityStamp: string; revokedSessions: number }>(
      "/api/auth/password",
      { method: "POST", body: json(input) },
    ),

  sessions: () => request<{ sessions: ApiSessionInfo[] }>("/api/auth/sessions"),

  revokeSession: (id: string) =>
    request<{ ok: true }>(`/api/auth/sessions/${id}`, { method: "DELETE" }),

  events: (params?: { limit?: number; before?: string }) =>
    request<{ events: ApiAuditEvent[]; nextCursor: string | null }>(
      `/api/auth/events${query(params)}`,
    ),

  items: (params?: {
    limit?: number;
    cursor?: string;
    type?: string;
    folderId?: string;
    favorite?: boolean;
    includeTrashed?: boolean;
  }) =>
    request<{ items: ApiItem[]; nextCursor: string | null }>(
      `/api/vault/items${query(params)}`,
    ),

  item: (id: string) => request<{ item: ApiItem }>(`/api/vault/items/${id}`),

  createItem: (input: {
    id?: string;
    type: string;
    nameEnc: string;
    notesEnc?: string | null;
    dataEnc: string;
    folderId?: string | null;
    favorite?: boolean;
    reprompt?: boolean;
  }) =>
    request<{ item: ApiItem }>("/api/vault/items", {
      method: "POST",
      body: json(input),
    }),

  updateItem: (
    id: string,
    input: {
      revision: number;
      nameEnc?: string;
      notesEnc?: string | null;
      dataEnc?: string;
      folderId?: string | null;
      favorite?: boolean;
      reprompt?: boolean;
    },
  ) =>
    request<{ item: ApiItem }>(`/api/vault/items/${id}`, {
      method: "PATCH",
      body: json(input),
    }),

  trashItem: (id: string) =>
    request<{ item: ApiItem }>(`/api/vault/items/${id}`, { method: "DELETE" }),

  restoreItem: (id: string) =>
    request<{ item: ApiItem }>(`/api/vault/items/${id}/restore`, {
      method: "POST",
    }),

  purgeItem: (id: string) =>
    request<{ ok: true }>(`/api/vault/items/${id}/purge`, { method: "DELETE" }),

  folders: () => request<{ folders: ApiFolder[] }>("/api/vault/folders"),

  createFolder: (nameEnc: string) =>
    request<{ folder: ApiFolder }>("/api/vault/folders", {
      method: "POST",
      body: json({ nameEnc }),
    }),

  updateFolder: (id: string, nameEnc: string) =>
    request<{ folder: ApiFolder }>(`/api/vault/folders/${id}`, {
      method: "PATCH",
      body: json({ nameEnc }),
    }),

  deleteFolder: (id: string) =>
    request<{ ok: true }>(`/api/vault/folders/${id}`, { method: "DELETE" }),

  providers: () =>
    request<{ providers: ApiProvider[]; presets: ProviderPreset[] }>(
      "/api/ai/providers",
    ),

  createProvider: (input: {
    presetId: string;
    label: string;
    apiKey?: string | null;
    baseUrl?: string | null;
    defaultModel?: string | null;
  }) =>
    request<{ provider: ApiProvider }>("/api/ai/providers", {
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
    },
  ) =>
    request<{ provider: ApiProvider }>(`/api/ai/providers/${id}`, {
      method: "PATCH",
      body: json(input),
    }),

  deleteProvider: (id: string) =>
    request<{ ok: true }>(`/api/ai/providers/${id}`, { method: "DELETE" }),

  testProvider: (id: string) =>
    request<{ ok: true; presetId: string; modelId: string; latencyMs: number }>(
      `/api/ai/providers/${id}/test`,
      { method: "POST" },
    ),

  aiSettings: () => request<{ settings: ApiSettings }>("/api/ai/settings"),

  updateAiSettings: (input: {
    aiMode?: "local" | "cloud";
    defaultProviderId?: string | null;
  }) =>
    request<{ settings: ApiSettings }>("/api/ai/settings", {
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
    request<ApiSearchResult>("/api/ai/search", {
      method: "POST",
      body: json(input),
    }),

  pwnedRange: (prefix: string) =>
    request<{ prefix: string; suffixes: string; cached: boolean }>(
      `/api/pwned/range?prefix=${prefix}`,
    ),
};
