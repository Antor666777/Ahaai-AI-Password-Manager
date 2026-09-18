import type { Folder, Item } from "@ahaai/db/schema";

export interface PublicItem {
  id: string;
  type: Item["type"];
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

export function toPublicItem(item: Item): PublicItem {
  return {
    id: item.id,
    type: item.type,
    nameEnc: item.nameEnc,
    notesEnc: item.notesEnc,
    dataEnc: item.dataEnc,
    folderId: item.folderId,
    favorite: item.favorite,
    reprompt: item.reprompt,
    revision: item.revision,
    deletedAt: item.deletedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
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
