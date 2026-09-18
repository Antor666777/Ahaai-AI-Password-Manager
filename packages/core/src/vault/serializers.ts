import type { Folder, Item, ItemRevision, Tag } from "@ahaai/db/schema";

export interface PublicItem {
  id: string;
  type: Item["type"];
  nameEnc: string;
  notesEnc: string | null;
  dataEnc: string;
  folderId: string | null;
  tagIds: string[];
  favorite: boolean;
  reprompt: boolean;
  revision: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The ids of the tags on an item, loaded by the service alongside the row. It is
 * optional here so a caller that never loaded tags still gets a valid public
 * shape: `tagIds` is a required field on the client, so it must always be an
 * array rather than `undefined`.
 */
export function toPublicItem(
  item: Item & { tagIds?: readonly string[] | null },
): PublicItem {
  return {
    id: item.id,
    type: item.type,
    nameEnc: item.nameEnc,
    notesEnc: item.notesEnc,
    dataEnc: item.dataEnc,
    folderId: item.folderId,
    tagIds: item.tagIds ? [...item.tagIds] : [],
    favorite: item.favorite,
    reprompt: item.reprompt,
    revision: item.revision,
    deletedAt: item.deletedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export interface PublicRevision {
  id: string;
  itemId: string;
  revision: number;
  nameEnc: string;
  notesEnc: string | null;
  dataEnc: string;
  createdAt: string;
}

export function toPublicRevision(revision: ItemRevision): PublicRevision {
  return {
    id: revision.id,
    itemId: revision.itemId,
    revision: revision.revision,
    nameEnc: revision.nameEnc,
    notesEnc: revision.notesEnc,
    dataEnc: revision.dataEnc,
    createdAt: revision.createdAt.toISOString(),
  };
}

export interface PublicFolder {
  id: string;
  nameEnc: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicFolder(folder: Folder): PublicFolder {
  return {
    id: folder.id,
    nameEnc: folder.nameEnc,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export interface PublicTag {
  id: string;
  nameEnc: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicTag(tag: Tag): PublicTag {
  return {
    id: tag.id,
    nameEnc: tag.nameEnc,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}
