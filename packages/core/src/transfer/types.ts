/**
 * Neutral shapes for the import/export pipeline.
 *
 * This directory is deliberately self-contained: it must not import from the
 * web app (`apps/web`), so the browser maps these records onto its own
 * `ItemDraft` / `ItemPayload` at the edge. Everything here is a pure value
 * shape, so a mapper can be unit-tested with a CSV fixture and no I/O.
 */

export type TransferItemType = "login" | "card" | "identity" | "secure_note";

export interface TransferCustomField {
  label: string;
  value: string;
  secret?: boolean;
}

/**
 * A structural superset of every item payload the app can hold. A vendor
 * mapper fills in only the fields it knows about; the caller narrows by
 * `type` before sealing. Property types match the web `LoginPayload` /
 * `CardPayload` / `IdentityPayload` / `SecureNotePayload` so the browser can
 * assign them without a cast.
 */
export interface ItemPayloadLike {
  // login
  username?: string;
  password?: string;
  /** Either a base32 secret or an `otpauth://` URI; normalised later. */
  totpSecret?: string;
  urls?: string[];
  custom?: TransferCustomField[];
  // card
  holder?: string;
  number?: string;
  expiry?: string;
  cvv?: string;
  brand?: string;
  // identity
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  // secure note
  body?: string;
}

export interface TransferRecord {
  type: TransferItemType;
  name: string;
  notes?: string;
  payload: ItemPayloadLike;
  /** Source folder / group / tag, when the export carries one. */
  folder?: string;
  favorite?: boolean;
}

/**
 * A row the mapper could not turn into a record. The import is never aborted
 * for one bad row; the caller shows the count and the reasons up front.
 */
export interface SkippedRow {
  /** 1-based CSV record number, header counted as record 1. */
  line: number;
  reason: string;
  /** The row re-serialised as a CSV line, for context in the UI. */
  raw: string;
}

export type TransferFormat =
  | "bitwarden"
  | "lastpass"
  | "onepassword"
  | "keepass"
  | "generic";

/** `"auto"` sniffs the header row; anything else forces a mapper. */
export type ImportFormat = "auto" | TransferFormat;

export type SkipCollector = (row: SkippedRow) => void;

/** Raised for a file that cannot be interpreted at all. Rows never throw. */
export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferError";
  }
}
