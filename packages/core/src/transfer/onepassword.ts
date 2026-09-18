import {
  cell,
  columnIndex,
  hasColumn,
  isBlankRow,
  serializeCsv,
  type CsvDocument,
} from "./csv";
import { parseBoolean, splitUrls } from "./shared";
import type { ItemPayloadLike, SkipCollector, TransferRecord } from "./types";

/**
 * 1Password CSV export (1Password 8).
 *
 * Header: `Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes`.
 * The export only covers Login items, so every row is a login. `OTPAuth` holds
 * either an `otpauth://` URI or the bare secret.
 */
export function detect(header: string[]): boolean {
  if (!hasColumn(header, "title")) return false;
  if (hasColumn(header, "otpauth")) return true;
  // KeePassXC also has Title/Username/Password/URL, so `Group` rules it out.
  return (
    hasColumn(header, "username") &&
    hasColumn(header, "password") &&
    !hasColumn(header, "group")
  );
}

export function parse(
  doc: CsvDocument,
  onSkip: SkipCollector = () => {},
): TransferRecord[] {
  const c = {
    title: columnIndex(doc.header, "title"),
    url: columnIndex(doc.header, "url"),
    username: columnIndex(doc.header, "username"),
    password: columnIndex(doc.header, "password"),
    otp: columnIndex(doc.header, "otpauth"),
    favorite: columnIndex(doc.header, "favorite"),
    notes: columnIndex(doc.header, "notes"),
  };

  const records: TransferRecord[] = [];

  for (const row of doc.rows) {
    const cells = row.cells;
    if (isBlankRow(cells)) continue;

    const name = cell(cells, c.title).trim();
    if (name.length === 0) {
      onSkip({
        line: row.line,
        reason: "Missing title",
        raw: serializeCsv([cells]),
      });
      continue;
    }

    const payload: ItemPayloadLike = {};
    const username = cell(cells, c.username);
    const password = cell(cells, c.password);
    const totp = cell(cells, c.otp).trim();
    const urls = splitUrls(cell(cells, c.url));
    if (username) payload.username = username;
    if (password) payload.password = password;
    if (totp) payload.totpSecret = totp;
    if (urls.length > 0) payload.urls = urls;

    const notes = cell(cells, c.notes).trim();
    const record: TransferRecord = {
      type: "login",
      name,
      payload,
      favorite: parseBoolean(cell(cells, c.favorite)),
    };
    if (notes) record.notes = notes;
    records.push(record);
  }

  return records;
}
