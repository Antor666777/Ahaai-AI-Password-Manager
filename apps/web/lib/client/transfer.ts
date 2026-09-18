"use client";

import { openString, sealString } from "@ahaai/core/crypto/aead";
import { deriveMasterKey, generateKdfParams } from "@ahaai/core/crypto/kdf";
import { splitMasterKey } from "@ahaai/core/crypto/split";
import {
  buildOtpauthUri,
  normalizeBase32,
  parseOtpauthUri,
} from "@ahaai/core/crypto/totp";
import {
  parseImport,
  toBitwardenCsv,
  toGenericCsv,
  TransferError,
  type ImportFormat,
  type ItemPayloadLike,
  type SkippedRow,
  type TransferFormat,
  type TransferItemType,
  type TransferRecord,
} from "@ahaai/core/transfer";
import { api } from "./api";
import { newId, sealItem } from "./crypto";
import type {
  CardPayload,
  DecryptedFolder,
  DecryptedItem,
  IdentityPayload,
  ItemPayload,
  KdfParams,
  LoginPayload,
  SecureNotePayload,
} from "./types";

/**
 * Web-side import/export glue for the pure `@ahaai/core/transfer` module.
 *
 * Import reads a File in the browser, maps the neutral records onto the vault's
 * sealed-item shape, seals each one with the in-memory vault key and posts them
 * in bulk. Export builds the bytes here and hands them to a Blob download.
 * Nothing in this module ever sends a plaintext credential to the server.
 */

/**
 * The server's `bulkCreateSchema` accepts at most 500 items per request, so a
 * batch never exceeds that. A batch is also kept under the API's 256 KB body
 * cap with margin: items are usually ~0.5 KB, so the byte guard rarely splits
 * below the item cap and only matters for outsized notes.
 */
const MAX_ITEMS_PER_BATCH = 500;
const MAX_BYTES_PER_BATCH = 200 * 1024;

/** Refuse an absurd file before spending time parsing it. */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const EXPORT_FORMAT = "ahaai-export";
const EXPORT_VERSION = 1;
/** Binds the ciphertext to this file type, so an export cannot be swapped. */
const EXPORT_AAD = "ahaai:export:v1";

export const CSV_MIME = "text/csv;charset=utf-8";
export const JSON_MIME = "application/json";

export type CsvExportKind = "bitwarden" | "generic";

export interface ImportPreflight {
  fileName: string;
  /** A vendor format, or `ahaai-json` for our own encrypted export. */
  format: TransferFormat | "ahaai-json";
  records: TransferRecord[];
  skipped: SkippedRow[];
  total: number;
  byType: Record<TransferItemType, number>;
  /** Distinct non-empty folder names the records reference. */
  folders: string[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  foldersCreated: number;
  byType: Record<TransferItemType, number>;
}

export interface CommitImportOptions {
  vaultKey: Uint8Array;
  /** Folders already in the vault, so an existing name is reused. */
  folders: DecryptedFolder[];
  /** Creates a missing folder; from `useVault().createFolder`. */
  createFolder?: (name: string) => Promise<DecryptedFolder>;
  onProgress?: (done: number, total: number) => void;
}

function emptyTypeCounts(): Record<TransferItemType, number> {
  return { login: 0, card: 0, identity: 0, secure_note: 0 };
}

function assertWithinImportLimit(file: File): void {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new TransferError(
      `That file is ${Math.round(file.size / 1024 / 1024)} MB, larger than the ${MAX_IMPORT_BYTES / 1024 / 1024} MB import limit.`,
    );
  }
}

function preflightFromRecords(
  fileName: string,
  format: ImportPreflight["format"],
  records: TransferRecord[],
  skipped: SkippedRow[] = [],
): ImportPreflight {
  const byType = emptyTypeCounts();
  for (const record of records) byType[record.type] += 1;

  const folders = [
    ...new Set(
      records
        .map((record) => record.folder)
        .filter((name): name is string => Boolean(name && name.trim().length > 0)),
    ),
  ];

  return {
    fileName,
    format,
    records,
    skipped,
    total: records.length,
    byType,
    folders,
  };
}

/**
 * Reads and parses a file without committing anything, so the UI can show a
 * pre-flight summary (counts by type, skipped rows) before the user confirms.
 */
export async function prepareImport(
  file: File,
  format: ImportFormat = "auto",
): Promise<ImportPreflight> {
  assertWithinImportLimit(file);
  const content = await file.text();
  const { records, skipped, format: detected } = parseImport(content, format);
  return preflightFromRecords(file.name, detected, records, skipped);
}

/** Our own encrypted export is the only JSON the import path accepts. */
export function isEncryptedExportFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".json") || file.type === JSON_MIME;
}

/**
 * Prepares one of our own encrypted exports so a backup can actually be
 * restored. The passphrase is independent of the master password, and a wrong
 * one throws before anything is sealed or sent.
 */
export async function prepareEncryptedImport(
  file: File,
  passphrase: string,
): Promise<ImportPreflight> {
  assertWithinImportLimit(file);
  const payload = await readEncryptedExport(await file.text(), passphrase);
  return preflightFromRecords(file.name, "ahaai-json", payload.items);
}

interface WireItem {
  id: string;
  type: TransferItemType;
  nameEnc: string;
  notesEnc: string | null;
  dataEnc: string;
  folderId: string | null;
  favorite: boolean;
}

/**
 * A vendor gives a bare base32 secret or an `otpauth://` URI. The item payload
 * stores the canonical URI, so this normalises through the same helpers the
 * editor uses; an unreadable value is dropped rather than stored broken.
 */
function toTotpUri(record: TransferRecord): string | undefined {
  const raw = record.payload.totpSecret?.trim();
  if (!raw) return undefined;
  if (/^otpauth:\/\//i.test(raw)) {
    const parsed = parseOtpauthUri(raw);
    return parsed ? buildOtpauthUri(parsed) : undefined;
  }
  try {
    return buildOtpauthUri({
      secret: normalizeBase32(raw),
      issuer: record.name.trim() || undefined,
    });
  } catch {
    return undefined;
  }
}

/**
 * Narrows a neutral payload onto the app's typed payload for its item type, so
 * a login never carries card fields and vice versa.
 */
export function payloadFor(record: TransferRecord): ItemPayload {
  const payload = record.payload;
  switch (record.type) {
    case "card":
      return {
        holder: payload.holder,
        number: payload.number,
        expiry: payload.expiry,
        cvv: payload.cvv,
        brand: payload.brand,
      };
    case "identity":
      return {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
      };
    case "secure_note":
      return { body: payload.body };
    default: {
      const login: LoginPayload = {
        username: payload.username,
        password: payload.password,
        urls: payload.urls,
        custom: payload.custom,
      };
      const totpUri = toTotpUri(record);
      if (totpUri) login.totpUri = totpUri;
      return login;
    }
  }
}

/** The inverse of `payloadFor`, used to build an export from vault items. */
function toNeutralPayload(
  type: TransferItemType,
  data: ItemPayload,
): ItemPayloadLike {
  switch (type) {
    case "card": {
      const card = data as CardPayload;
      return {
        holder: card.holder,
        number: card.number,
        expiry: card.expiry,
        cvv: card.cvv,
        brand: card.brand,
      };
    }
    case "identity": {
      const identity = data as IdentityPayload;
      return {
        fullName: identity.fullName,
        email: identity.email,
        phone: identity.phone,
        address: identity.address,
      };
    }
    case "secure_note": {
      const note = data as SecureNotePayload;
      return { body: note.body };
    }
    default: {
      const login = data as LoginPayload;
      // The neutral shape carries one TOTP value, so the canonical URI is the
      // one that travels; the legacy rotating code is not exportable.
      return {
        username: login.username,
        password: login.password,
        totpSecret: login.totpUri,
        urls: login.urls,
        custom: login.custom,
      };
    }
  }
}

function sealRecord(
  vaultKey: Uint8Array,
  record: TransferRecord,
  folderIdByName: Map<string, string>,
): WireItem {
  const id = newId();
  const sealed = sealItem(vaultKey, id, {
    name: record.name,
    notes: record.notes ?? "",
    data: payloadFor(record),
  });
  return {
    id,
    type: record.type,
    nameEnc: sealed.nameEnc,
    notesEnc: sealed.notesEnc,
    dataEnc: sealed.dataEnc,
    folderId: record.folder
      ? folderIdByName.get(record.folder.toLowerCase()) ?? null
      : null,
    favorite: record.favorite ?? false,
  };
}

/** Splits sealed items into request-sized batches by count and by byte size. */
function batchItems(items: WireItem[]): WireItem[][] {
  const batches: WireItem[][] = [];
  let current: WireItem[] = [];
  let bytes = 0;

  for (const item of items) {
    const size = JSON.stringify(item).length + 1;
    if (
      current.length > 0 &&
      (current.length >= MAX_ITEMS_PER_BATCH ||
        bytes + size > MAX_BYTES_PER_BATCH)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Commits a prepared import: creates any missing folders, seals every record
 * under the in-memory vault key, and posts them in bulk. The caller reloads the
 * vault afterwards.
 */
export async function commitImport(
  preflight: ImportPreflight,
  options: CommitImportOptions,
): Promise<ImportResult> {
  const { vaultKey, folders, createFolder, onProgress } = options;

  const folderIdByName = new Map<string, string>();
  for (const folder of folders) {
    folderIdByName.set(folder.name.toLowerCase(), folder.id);
  }

  let foldersCreated = 0;
  for (const name of preflight.folders) {
    const key = name.toLowerCase();
    if (folderIdByName.has(key) || !createFolder) continue;
    const created = await createFolder(name);
    folderIdByName.set(key, created.id);
    foldersCreated += 1;
  }

  const payloads = preflight.records.map((record) =>
    sealRecord(vaultKey, record, folderIdByName),
  );

  let imported = 0;
  for (const batch of batchItems(payloads)) {
    await api.bulkCreateItem(batch);
    imported += batch.length;
    onProgress?.(imported, payloads.length);
  }

  return {
    imported,
    skipped: preflight.skipped.length,
    foldersCreated,
    byType: preflight.byType,
  };
}

/** One neutral record per item, with its folder name resolved. */
export function recordsFromItems(
  items: DecryptedItem[],
  folders: DecryptedFolder[],
): TransferRecord[] {
  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.name]));

  return items.map((item) => {
    const record: TransferRecord = {
      type: item.type,
      name: item.name,
      payload: toNeutralPayload(item.type, item.data),
      favorite: item.favorite,
    };
    if (item.notes.length > 0) record.notes = item.notes;
    const folder = item.folderId ? folderNameById.get(item.folderId) : undefined;
    if (folder) record.folder = folder;
    return record;
  });
}

/** Plaintext CSV. Callers must warn the user that this file is unencrypted. */
export function buildCsvExport(
  items: DecryptedItem[],
  folders: DecryptedFolder[],
  kind: CsvExportKind,
): string {
  const records = recordsFromItems(items, folders);
  return kind === "bitwarden" ? toBitwardenCsv(records) : toGenericCsv(records);
}

/** The plaintext that lives inside the encrypted export envelope. */
export interface ExportPayload {
  items: TransferRecord[];
}

export interface EncryptedExportEnvelope {
  format: typeof EXPORT_FORMAT;
  version: number;
  createdAt: string;
  itemCount: number;
  kdfParams: KdfParams;
  payload: string;
}

/**
 * Encrypted JSON export.
 *
 * ```
 * {
 *   "format": "ahaai-export",
 *   "version": 1,
 *   "createdAt": "<iso>",
 *   "itemCount": <n>,
 *   "kdfParams": { algo, version, memoryKiB, iterations, parallelism, salt },
 *   "payload": "v1.<base64 nonce>.<base64 ciphertext+tag>"
 * }
 * ```
 *
 * `payload` is `sealString(encKey, JSON.stringify({ items }), "ahaai:export:v1")`
 * where `encKey` is `splitMasterKey(deriveMasterKey(passphrase, kdfParams)).encKey`.
 * The envelope carries its own `kdfParams`, so the file can be decrypted later
 * with only the passphrase; the constant AAD binds the ciphertext to this file
 * type. The passphrase is independent of the master password.
 */
export async function buildEncryptedExport(
  items: DecryptedItem[],
  folders: DecryptedFolder[],
  passphrase: string,
): Promise<string> {
  const payload: ExportPayload = { items: recordsFromItems(items, folders) };
  const kdfParams = generateKdfParams();
  const masterKey = await deriveMasterKey(passphrase, kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  masterKey.fill(0);

  const envelope: EncryptedExportEnvelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    createdAt: new Date().toISOString(),
    itemCount: payload.items.length,
    kdfParams,
    payload: sealString(encKey, JSON.stringify(payload), EXPORT_AAD),
  };
  encKey.fill(0);

  return JSON.stringify(envelope, null, 2);
}

/** Inverse of `buildEncryptedExport`; kept so the format is actually usable. */
export async function readEncryptedExport(
  text: string,
  passphrase: string,
): Promise<ExportPayload> {
  let envelope: EncryptedExportEnvelope;
  try {
    envelope = JSON.parse(text) as EncryptedExportEnvelope;
  } catch {
    throw new TransferError("That file is not valid JSON.");
  }
  if (envelope?.format !== EXPORT_FORMAT) {
    throw new TransferError("That file is not an Ahaai encrypted export.");
  }

  const masterKey = await deriveMasterKey(passphrase, envelope.kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  masterKey.fill(0);

  try {
    return JSON.parse(
      openString(encKey, envelope.payload, EXPORT_AAD),
    ) as ExportPayload;
  } catch {
    throw new TransferError(
      "Could not decrypt that export. Check the passphrase and try again.",
    );
  } finally {
    encKey.fill(0);
  }
}

/** Hands the bytes to the browser as a download. */
export function downloadFile(
  fileName: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the click a tick to start before the object URL is revoked.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportFileName(extension: string, at: Date = new Date()): string {
  return `ahaai-export-${at.toISOString().slice(0, 10)}.${extension}`;
}
