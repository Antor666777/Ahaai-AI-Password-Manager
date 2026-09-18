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
  ApiRevision,
  DecryptedFolder,
  DecryptedItem,
  DecryptedTag,
  ItemPayload,
  ItemType,
  MatchConfidence,
} from "./types";

const FOLDER_AAD = "ahaai:folder:v1";
const TAG_AAD = "ahaai:tag:v1";
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
  confidence: MatchConfidence;
}

export interface SearchOutcome {
  hits: SearchHit[];
  modelId: string;
  presetId: string;
  truncated: boolean;
  candidateCount: number;
  /** How many candidates the decision engine actually compared. */
  shortlistCount: number;
  engine: "evaluation" | "language";
  /** Whether the decision model ran with zero retention. Absent otherwise. */
  zeroDataRetention?: boolean;
}

export interface ItemDraft {
  type: ItemType;
  name: string;
  notes: string;
  data: ItemPayload;
  folderId: string | null;
  favorite: boolean;
  /** Demand the master password before this item's secrets are revealed. */
  reprompt: boolean;
  /** Ids of the tags to assign. Absent means leave the item's tags alone. */
  tagIds?: string[];
}

interface VaultValue {
  loading: boolean;
  error: string | null;
  items: DecryptedItem[];
  trashed: DecryptedItem[];
  folders: DecryptedFolder[];
  tags: DecryptedTag[];
  createItem: (draft: ItemDraft) => Promise<DecryptedItem>;
  updateItem: (id: string, draft: ItemDraft) => Promise<DecryptedItem>;
  /**
   * Decrypts one stored snapshot for preview. The snapshot's envelopes carry
   * the item id in their AAD, so the current item supplies the metadata.
   */
  openRevision: (item: DecryptedItem, revision: ApiRevision) => DecryptedItem;
  /**
   * Restores a snapshot. There is no restore endpoint: the old envelopes are a
   * normal update, which snapshots the version it replaces so a restore is
   * itself undoable.
   */
  restoreRevision: (itemId: string, revision: ApiRevision) => Promise<void>;
  setFavorite: (id: string, favorite: boolean) => Promise<void>;
  trashItem: (id: string) => Promise<void>;
  restoreItem: (id: string) => Promise<void>;
  purgeItem: (id: string) => Promise<void>;
  bulkTrash: (ids: string[]) => Promise<void>;
  bulkRestore: (ids: string[]) => Promise<void>;
  bulkFavorite: (ids: string[], favorite: boolean) => Promise<void>;
  bulkMove: (ids: string[], folderId: string | null) => Promise<void>;
  bulkDestroy: (ids: string[]) => Promise<void>;
  createFolder: (name: string) => Promise<DecryptedFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  createTag: (name: string) => Promise<DecryptedTag>;
  renameTag: (id: string, name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
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
  const [tags, setTags] = useState<DecryptedTag[]>([]);

  const reload = useCallback(async () => {
    if (!vaultKey) return;
    setLoading(true);
    setError(null);
    try {
      const [all, folderRows, tagRows] = await Promise.all([
        fetchAllItems(),
        api.folders(),
        api.tags(),
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
      setTags(
        tagRows.tags.map((tag) => ({
          id: tag.id,
          name: safeOpenTag(vaultKey, tag.nameEnc),
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
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
      setTags([]);
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
        reprompt: draft.reprompt,
        tagIds: draft.tagIds,
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
        reprompt: draft.reprompt,
        // Absent means "leave the item's tags as they are", so the key is
        // omitted entirely rather than sent empty (which would clear them).
        ...(draft.tagIds !== undefined ? { tagIds: draft.tagIds } : {}),
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
        // The patch is partial, so the protection flag has to travel with it;
        // otherwise toggling a favourite would silently clear `reprompt`.
        reprompt: existing.reprompt,
      });
      const updated = openItem(vaultKey, result.item);
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    },
    [items, vaultKey],
  );

  const openRevision = useCallback(
    (item: DecryptedItem, revision: ApiRevision): DecryptedItem => {
      // The key never leaves this module; a locked vault cannot preview a
      // snapshot, so fall back to the item as it stands.
      if (!vaultKey) return item;
      const snapshot: ApiItem = {
        id: revision.itemId,
        type: item.type,
        nameEnc: revision.nameEnc,
        notesEnc: revision.notesEnc,
        dataEnc: revision.dataEnc,
        folderId: item.folderId,
        tagIds: item.tagIds,
        favorite: item.favorite,
        reprompt: item.reprompt,
        revision: revision.revision,
        deletedAt: null,
        createdAt: revision.createdAt,
        updatedAt: revision.createdAt,
      };
      return openItem(vaultKey, snapshot);
    },
    [vaultKey],
  );

  const restoreRevision = useCallback(
    async (itemId: string, revision: ApiRevision) => {
      if (!vaultKey) return;
      const existing = items.find((item) => item.id === itemId);
      if (!existing) return;
      const result = await api.updateItem(itemId, {
        revision: existing.revision,
        nameEnc: revision.nameEnc,
        notesEnc: revision.notesEnc,
        dataEnc: revision.dataEnc,
      });
      const updated = openItem(vaultKey, result.item);
      setItems((current) =>
        current.map((item) => (item.id === itemId ? updated : item)),
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

  /**
   * Bulk actions apply the rows the API returns rather than refetching: a large
   * vault would pay a full multi-page reload for a single click, and the server
   * already hands back exactly the rows that changed.
   */
  const bulkTrash = useCallback(
    async (ids: string[]) => {
      if (!vaultKey) return;
      const result = await api.bulkUpdateItems({ action: "trash", ids });
      const updated = result.items.map((item) => openItem(vaultKey, item));
      const trashedIds = new Set(updated.map((item) => item.id));
      setItems((current) =>
        current.filter((entry) => !trashedIds.has(entry.id)),
      );
      setTrashed((current) => [...updated, ...current]);
    },
    [vaultKey],
  );

  const bulkRestore = useCallback(
    async (ids: string[]) => {
      if (!vaultKey) return;
      const result = await api.bulkUpdateItems({ action: "restore", ids });
      const updated = result.items.map((item) => openItem(vaultKey, item));
      const restoredIds = new Set(updated.map((item) => item.id));
      setTrashed((current) =>
        current.filter((entry) => !restoredIds.has(entry.id)),
      );
      setItems((current) => [...updated, ...current]);
    },
    [vaultKey],
  );

  const bulkFavorite = useCallback(
    async (ids: string[], favorite: boolean) => {
      if (!vaultKey) return;
      const result = await api.bulkUpdateItems({
        action: "favorite",
        ids,
        favorite,
      });
      const byId = new Map(
        result.items.map((item) => [item.id, openItem(vaultKey, item)]),
      );
      setItems((current) =>
        current.map((entry) => byId.get(entry.id) ?? entry),
      );
    },
    [vaultKey],
  );

  const bulkMove = useCallback(
    async (ids: string[], folderId: string | null) => {
      if (!vaultKey) return;
      const result = await api.bulkUpdateItems({
        action: "move",
        ids,
        folderId,
      });
      const byId = new Map(
        result.items.map((item) => [item.id, openItem(vaultKey, item)]),
      );
      setItems((current) =>
        current.map((entry) => byId.get(entry.id) ?? entry),
      );
    },
    [vaultKey],
  );

  const bulkDestroy = useCallback(
    async (ids: string[]) => {
      const result = await api.bulkUpdateItems({ action: "destroy", ids });
      const destroyedIds = new Set(result.items.map((item) => item.id));
      setItems((current) =>
        current.filter((entry) => !destroyedIds.has(entry.id)),
      );
      setTrashed((current) =>
        current.filter((entry) => !destroyedIds.has(entry.id)),
      );
    },
    [],
  );

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

  const createTag = useCallback(
    async (name: string) => {
      if (!vaultKey) throw new Error("Unlock the vault first.");
      const result = await api.createTag(sealString(vaultKey, name, TAG_AAD));
      const tag: DecryptedTag = {
        id: result.tag.id,
        name,
        createdAt: result.tag.createdAt,
        updatedAt: result.tag.updatedAt,
      };
      setTags((current) => [tag, ...current]);
      return tag;
    },
    [vaultKey],
  );

  const renameTag = useCallback(
    async (id: string, name: string) => {
      if (!vaultKey) return;
      await api.renameTag(id, sealString(vaultKey, name, TAG_AAD));
      setTags((current) =>
        current.map((tag) => (tag.id === id ? { ...tag, name } : tag)),
      );
    },
    [vaultKey],
  );

  const deleteTag = useCallback(async (id: string) => {
    await api.deleteTag(id);
    setTags((current) => current.filter((tag) => tag.id !== id));
    // The tag is relational, so local items keep a stale id until they reload.
    // Drop it here so the UI does not render a chip for a tag that is gone.
    setItems((current) =>
      current.map((item) =>
        item.tagIds.includes(id)
          ? { ...item, tagIds: item.tagIds.filter((tagId) => tagId !== id) }
          : item,
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
        if (item) {
          hits.push({
            item,
            reason: match.reason,
            score: match.score,
            confidence: match.confidence,
          });
        }
      }

      return {
        hits,
        modelId: result.modelId,
        presetId: result.presetId,
        truncated: result.truncated,
        candidateCount: set.candidates.length,
        shortlistCount: result.shortlistCount ?? set.candidates.length,
        engine: result.engine ?? "language",
        zeroDataRetention: result.zeroDataRetention,
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
      tags,
      createItem,
      updateItem,
      openRevision,
      restoreRevision,
      setFavorite,
      trashItem,
      restoreItem,
      purgeItem,
      bulkTrash,
      bulkRestore,
      bulkFavorite,
      bulkMove,
      bulkDestroy,
      createFolder,
      renameFolder,
      deleteFolder,
      createTag,
      renameTag,
      deleteTag,
      search,
      reload,
    }),
    [
      loading,
      error,
      items,
      trashed,
      folders,
      tags,
      createItem,
      updateItem,
      openRevision,
      restoreRevision,
      setFavorite,
      trashItem,
      restoreItem,
      purgeItem,
      bulkTrash,
      bulkRestore,
      bulkFavorite,
      bulkMove,
      bulkDestroy,
      createFolder,
      renameFolder,
      deleteFolder,
      createTag,
      renameTag,
      deleteTag,
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

function safeOpenTag(vaultKey: Uint8Array, envelope: string): string {
  try {
    // Tag names use a constant AAD, exactly like folder names.
    return openString(vaultKey, envelope, TAG_AAD);
  } catch {
    return "Untitled tag";
  }
}
