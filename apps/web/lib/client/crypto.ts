"use client";

import { openJson, openString, sealJson, sealString } from "@ahaai/core/crypto/aead";
import { generateKdfParams } from "@ahaai/core/crypto/kdf";
import { authHashFromMasterKey, splitMasterKey } from "@ahaai/core/crypto/split";
import {
  buildSearchCandidates,
  type CandidateSet,
  type CandidateSource,
} from "@ahaai/core/crypto/tokenize";
import {
  generateVaultKey,
  rewrapVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
} from "@ahaai/core/crypto/vault-key";
import { deriveMasterKey } from "@ahaai/core/crypto/kdf";
import type { ApiItem, DecryptedItem, ItemPayload, KdfParams } from "./types";

/** AAD binds each ciphertext to its item and field, so rows cannot be swapped. */
export function itemAad(
  itemId: string,
  field: "name" | "notes" | "data",
): string {
  return `ahaai:item:v1:${itemId}:${field}`;
}

function binding(email: string): string {
  return email.trim().toLowerCase();
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Ambiguous characters (l, I, O, 0, 1) are left out on purpose. */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+";
const CLASSES = [LOWER, UPPER, DIGITS, SYMBOLS];

/**
 * Uniform index below `max`. Rejection sampling instead of `% max`, which is
 * biased whenever 256 is not a multiple of the space.
 */
function randomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const bytes = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(bytes);
    if (bytes[0] < limit) return bytes[0] % max;
  }
}

/**
 * Generates a password that is guaranteed at least one character from every
 * class, then shuffled so the guaranteed positions are not predictable.
 */
export function generatePassword(length = 20): string {
  const alphabet = CLASSES.join("");
  const chars: string[] = [];

  for (let i = 0; i < Math.min(length, CLASSES.length); i += 1) {
    const set = CLASSES[i];
    chars.push(set[randomIndex(set.length)]);
  }
  for (let i = CLASSES.length; i < length; i += 1) {
    chars.push(alphabet[randomIndex(alphabet.length)]);
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const swap = chars[i];
    chars[i] = chars[j];
    chars[j] = swap;
  }

  return chars.join("");
}

export interface ItemSecrets {
  name: string;
  notes?: string;
  data: ItemPayload;
}

export interface SealedItem {
  nameEnc: string;
  notesEnc: string | null;
  dataEnc: string;
}

export function sealItem(
  vaultKey: Uint8Array,
  itemId: string,
  secrets: ItemSecrets,
): SealedItem {
  return {
    nameEnc: sealString(vaultKey, secrets.name, itemAad(itemId, "name")),
    notesEnc: secrets.notes
      ? sealString(vaultKey, secrets.notes, itemAad(itemId, "notes"))
      : null,
    dataEnc: sealJson(vaultKey, secrets.data, itemAad(itemId, "data")),
  };
}

/**
 * Decrypts one item. A single bad field degrades to a placeholder instead of
 * taking the whole list down.
 */
export function openItem(vaultKey: Uint8Array, item: ApiItem): DecryptedItem {
  let name = "Untitled";
  let notes = "";
  let data: ItemPayload = {};

  try {
    name = openString(vaultKey, item.nameEnc, itemAad(item.id, "name"));
  } catch {
    name = "Undecryptable";
  }
  if (item.notesEnc) {
    try {
      notes = openString(vaultKey, item.notesEnc, itemAad(item.id, "notes"));
    } catch {
      notes = "";
    }
  }
  try {
    data = openJson<ItemPayload>(vaultKey, item.dataEnc, itemAad(item.id, "data"));
  } catch {
    data = {};
  }

  return {
    id: item.id,
    type: item.type,
    name,
    notes,
    data,
    folderId: item.folderId,
    tagIds: item.tagIds,
    favorite: item.favorite,
    reprompt: item.reprompt,
    revision: item.revision,
    deletedAt: item.deletedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export interface RegistrationMaterial {
  authHash: string;
  kdfParams: KdfParams;
  protectedVaultKey: string;
  vaultKey: Uint8Array;
}

export async function deriveRegistration(
  password: string,
  email: string,
): Promise<RegistrationMaterial> {
  const kdfParams = generateKdfParams();
  const masterKey = await deriveMasterKey(password, kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  const vaultKey = generateVaultKey();
  return {
    authHash: authHashFromMasterKey(masterKey),
    kdfParams,
    protectedVaultKey: wrapVaultKey(vaultKey, encKey, binding(email)),
    vaultKey,
  };
}

export async function deriveAuthHash(
  password: string,
  kdfParams: KdfParams,
): Promise<string> {
  return authHashFromMasterKey(await deriveMasterKey(password, kdfParams));
}

export interface UnlockedVault {
  vaultKey: Uint8Array;
  authHash: string;
}

/**
 * Derives keys from the master password and unwraps the vault key. A wrong
 * password fails the GCM tag check, which is our unlock signal.
 */
export async function unlockVault(
  password: string,
  kdfParams: KdfParams,
  protectedVaultKey: string,
  email: string,
): Promise<UnlockedVault> {
  const masterKey = await deriveMasterKey(password, kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  const vaultKey = unwrapVaultKey(
    protectedVaultKey,
    encKey,
    binding(email),
  );
  return { vaultKey, authHash: authHashFromMasterKey(masterKey) };
}

export interface RewrapMaterial {
  authHash: string;
  kdfParams: KdfParams;
  protectedVaultKey: string;
}

/**
 * Re-wraps the SAME vault key under a new master password. Items stay sealed
 * under the existing vault key, so changing the password never orphans them.
 */
export async function rewrapForNewPassword(
  vaultKey: Uint8Array,
  newPassword: string,
  email: string,
): Promise<RewrapMaterial> {
  const kdfParams = generateKdfParams();
  const rewrapped = await rewrapVaultKey(
    vaultKey,
    newPassword,
    kdfParams,
    binding(email),
  );
  return {
    authHash: rewrapped.authHash,
    kdfParams,
    protectedVaultKey: rewrapped.protectedVaultKey,
  };
}

/**
 * Re-wraps the SAME vault key under the SAME password with a new email
 * binding. The envelope is AAD-bound to the normalized address, so changing the
 * email without re-wrapping leaves a key that only unwraps against the old
 * address, which fails at unlock with a GCM tag error. The KDF params are the
 * ones already on the account: reusing them keeps the derived enc key, and
 * therefore the stored auth hash, unchanged.
 */
export async function rewrapForNewEmail(
  vaultKey: Uint8Array,
  password: string,
  newEmail: string,
  kdfParams: KdfParams,
): Promise<{ protectedVaultKey: string }> {
  const masterKey = await deriveMasterKey(password, kdfParams);
  const { encKey } = splitMasterKey(masterKey);
  return {
    protectedVaultKey: wrapVaultKey(vaultKey, encKey, binding(newEmail)),
  };
}

export function domainOf(item: DecryptedItem): string | undefined {
  const data = item.data as { urls?: string[] };
  const first = data.urls?.find((value) => value.trim().length > 0);
  if (!first) return undefined;
  try {
    const withScheme = first.includes("://") ? first : `https://${first}`;
    return new URL(withScheme).hostname;
  } catch {
    return first;
  }
}

/**
 * Builds the per-request token set. Tokens are minted fresh here and the map
 * back to items stays in the browser, so the AI never sees a real credential.
 */
export function buildCandidateSet(items: DecryptedItem[]): {
  set: CandidateSet;
  byToken: Map<string, DecryptedItem>;
} {
  const sources: CandidateSource[] = items.map((item) => ({
    id: item.id,
    title: item.name,
    note: item.notes.length > 0 ? item.notes : undefined,
    domain: domainOf(item),
  }));

  const set = buildSearchCandidates(sources);
  const byToken = new Map<string, DecryptedItem>();
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const [token, id] of set.idByToken) {
    const item = byId.get(id);
    if (item) byToken.set(token, item);
  }

  return { set, byToken };
}
