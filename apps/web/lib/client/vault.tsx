"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   The vault is fetched and decrypted after the key is in memory. Every setState
   in these effects lands after the awaited work resolves, which is the intended
   pattern for client-side data loading; it is not a synchronous cascading
   render. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { openString, sealString } from "@ahaai/core/crypto/aead";
import { api } from "./api";
import { buildCandidateSet, newId, openItem, sealItem } from "./crypto";
import { useSession } from "./session";
import type {
  AiMode,
  ApiItem,
  DecryptedFolder,
  DecryptedItem,
  ItemPayload,
  ItemType,
} from "./types";

const FOLDER_AAD = "ahaai:folder:v1";
const PAGE_LIMIT = 500;

/**
 * Walks every page of the item list. The endpoint caps a page at 500, so a
 * single request would silently hide the rest of a large vault.
 */
async function fetchAllItems(): Promise<ApiItem[]> {
  const collected: ApiItem[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await api.items({
      limit: PAGE_LIMIT,
      includeTrashed: true,
      cursor,
    });
    collected.push(...page.items);
    if (!page.nextCursor || page.nextCursor === cursor) return collected;
    cursor = page.nextCursor;
  }
}

export interface SearchHit {
  item: DecryptedItem;
  reason: string;
  score: number;
}

export interface SearchOutcome {
  hits: SearchHit[];
  modelId: string;
  presetId: string;
  truncated: boolean;
  candidateCount: number;
}

export interface ItemDraft {
  type: ItemType;
  name: string;
  notes: string;
  data: ItemPayload;
  folderId: string | null;
  favorite: boolean;
}

interface VaultValue {
  loading: boolean;
  error: string | null;
  items: DecryptedItem[];
  trashed: DecryptedItem[];
  folders: DecryptedFolder[];
  createItem: (draft: ItemDraft) => Promise<DecryptedItem>;
  updateItem: (id: string, draft: ItemDraft) => Promise<DecryptedItem>;
  setFavorite: (id: string, favorite: boolean) => Promise<void>;
  trashItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  purgeItem: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<DecryptedFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  search: (query: string, options?: { mode?: AiMode }) => Promise<SearchOutcome>;
  reload: () => Promise<void>;
}

const VaultContext = createContext<VaultValue | null>(null);

export function useVault(): VaultValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used inside VaultProvider");
  return context;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const { vaultKey, settings, user } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [trashed, setTrashed] = useState<DecryptedItem[]>([]);
  const [folders, setFolders] = useState<DecryptedFolder[]>([]);

  const reload = useCallback(async () => {
    if (!vaultKey) return;
    setLoading(true);
    setError(null);
    try {
      const [all, folderRows] = await Promise.all([
        fetchAllItems(),
        api.folders(),
      ]);
      const decoded = all.map((item) => openItem(vaultKey, item));
      setItems(decoded.filter((item) => item.deletedAt === null));
      setTrashed(decoded.filter((item) => item.deletedAt !== null));
      setFolders(
        folderRows.folders.map((folder) => ({
          id: folder.id,
          name: safeOpen(vaultKey, folder.nameEnc),
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the vault.",
      );
    } finally {
      setLoading(false);
    }
  }, [vaultKey]);

  useEffect(() => {
    if (vaultKey) void reload();
    else {
      setItems([]);
      setTrashed([]);
      setFolders([]);
    }
  }, [vaultKey, reload]);

  const createItem = useCallback(
    async (draft: ItemDraft) => {
      if (!vaultKey) throw new Error("Unlock the vault first.");
      const id = newId();
      const sealed = sealItem(vaultKey, id, {
        name: draft.name,
        notes: draft.notes,
        data: draft.data,
      });
      const result = await api.createItem({
        id,
        type: draft.type,
        nameEnc: sealed.nameEnc,
        notesEnc: sealed.notesEnc,
        dataEnc: sealed.dataEnc,
        folderId: draft.folderId,
        favorite: draft.favorite,
      });
      const item = openItem(vaultKey, result.item);
      setItems((current) => [item, ...current]);
      return item;
    },
    [vaultKey],
  );

  const updateItem = useCallback(
    async (id: string, draft: ItemDraft) => {
      if (!vaultKey) throw new Error("Unlock the vault first.");
      const existing = items.find((item) => item.id === id);
      if (!existing) throw new Error("That item is no longer in the vault.");

      const sealed = sealItem(vaultKey, id, {
        name: draft.name,
        notes: draft.notes,
        data: draft.data,
      });
      const result = await api.updateItem(id, {
        revision: existing.revision,
        nameEnc: sealed.nameEnc,
        notesEnc: sealed.notesEnc,
        dataEnc: sealed.dataEnc,
        folderId: draft.folderId,
        favorite: draft.favorite,
      });
      const updated = openItem(vaultKey, result.item);
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      return updated;
    },
    [items, vaultKey],
  );

  const setFavorite = useCallback(
    async (id: string, favorite: boolean) => {
      if (!vaultKey) return;
      const existing = items.find((item) => item.id === id);
      if (!existing) return;
      const result = await api.updateItem(id, {
        revision: existing.revision,
        favorite,
      });
      const updated = openItem(vaultKey, result.item);
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    },
    [items, vaultKey],
  );

  const trashItem = useCallback(
    async (id: string) => {
      if (!vaultKey) return;
      const result = await api.trashItem(id);
      const item = openItem(vaultKey, result.item);
      setItems((current) => current.filter((entry) => entry.id !== id));
      setTrashed((current) => [item, ...current]);
    },
    [vaultKey],
  );

  const restoreItem = useCallback(
    async (id: string) => {
      if (!vaultKey) return;
      const result = await api.restoreItem(id);
      const item = openItem(vaultKey, result.item);
      setTrashed((current) => current.filter((entry) => entry.id !== id));
      setItems((current) => [item, ...current]);
    },
    [vaultKey],
  );

  const purgeItem = useCallback(async (id: string) => {
    await api.purgeItem(id);
    setTrashed((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const createFolder = useCallback(
    async (name: string) => {
      if (!vaultKey) throw new Error("Unlock the vault first.");
      const result = await api.createFolder(sealString(vaultKey, name, FOLDER_AAD));
      const folder: DecryptedFolder = {
        id: result.folder.id,
        name,
        createdAt: result.folder.createdAt,
        updatedAt: result.folder.updatedAt,
      };
      setFolders((current) => [folder, ...current]);
      return folder;
    },
    [vaultKey],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (!vaultKey) return;
      await api.updateFolder(id, sealString(vaultKey, name, FOLDER_AAD));
      setFolders((current) =>
        current.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
      );
    },
    [vaultKey],
  );

  const deleteFolder = useCallback(async (id: string) => {
    await api.deleteFolder(id);
    setFolders((current) => current.filter((folder) => folder.id !== id));
    setItems((current) =>
      current.map((item) =>
        item.folderId === id ? { ...item, folderId: null } : item,
      ),
    );
  }, []);

  const search = useCallback(
    async (
      query: string,
      options?: { mode?: AiMode },
    ): Promise<SearchOutcome> => {
      if (!vaultKey) throw new Error("Unlock the vault first.");
      if (!user) throw new Error("Sign in again to search.");

      const { set, byToken } = buildCandidateSet(items);
      const result = await api.search({
        query,
        // An explicit mode lets a retry use a mode that was just saved in the
        // same tick, instead of the value this closure captured.
        mode: options?.mode ?? settings?.aiMode ?? "cloud",
        providerId: settings?.defaultProviderId ?? undefined,
        candidates: set.candidates,
      });

      const hits: SearchHit[] = [];
      for (const match of result.matches) {
        const item = byToken.get(match.token);
        if (item) hits.push({ item, reason: match.reason, score: match.score });
      }

      return {
        hits,
        modelId: result.modelId,
        presetId: result.presetId,
        truncated: result.truncated,
        candidateCount: set.candidates.length,
      };
    },
    [items, settings, user, vaultKey],
  );

  const value = useMemo<VaultValue>(
    () => ({
      loading,
      error,
      items,
      trashed,
      folders,
      createItem,
      updateItem,
      setFavorite,
      trashItem,
      restoreItem,
      purgeItem,
      createFolder,
      renameFolder,
      deleteFolder,
      search,
      reload,
    }),
    [
      loading,
      error,
      items,
      trashed,
      folders,
      createItem,
      updateItem,
      setFavorite,
      trashItem,
      restoreItem,
      purgeItem,
      createFolder,
      renameFolder,
      deleteFolder,
      search,
      reload,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

function safeOpen(vaultKey: Uint8Array, envelope: string): string {
  try {
    // Folder names use a constant AAD, so no per-row binding is needed.
    return openString(vaultKey, envelope, FOLDER_AAD);
  } catch {
    return "Untitled folder";
  }
}
