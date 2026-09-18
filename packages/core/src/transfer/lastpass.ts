import {
  cell,
  columnIndex,
  field,
  hasColumn,
  isBlankRow,
  serializeCsv,
  type CsvDocument,
} from "./csv";
import { parseBoolean, splitUrls } from "./shared";
import type { ItemPayloadLike, SkipCollector, TransferRecord } from "./types";

/**
 * LastPass CSV export.
 *
 * Header: `url,username,password,totp,extra,name,grouping,fav`. Every row is a
 * login — LastPass needs a separate export for secure notes — and the folder is
 * called `grouping` (nested folders use a backslash in that value).
 */
export function detect(header: string[]): boolean {
  return (
    hasColumn(header, "url") &&
    (hasColumn(header, "grouping") || hasColumn(header, "extra"))
  );
}

export function parse(
  doc: CsvDocument,
  onSkip: SkipCollector = () => {},
): TransferRecord[] {
  const c = {
    url: columnIndex(doc.header, "url"),
    username: columnIndex(doc.header, "username"),
    password: columnIndex(doc.header, "password"),
    totp: columnIndex(doc.header, "totp"),
    extra: columnIndex(doc.header, "extra"),
    name: columnIndex(doc.header, "name"),
    grouping: columnIndex(doc.header, "grouping"),
    fav: columnIndex(doc.header, "fav"),
  };

  const records: TransferRecord[] = [];

  for (const row of doc.rows) {
    const cells = row.cells;
    if (isBlankRow(cells)) continue;

    const name = cell(cells, c.name).trim();
    if (name.length === 0) {
      onSkip({
        line: row.line,
        reason: "Missing name",
        raw: serializeCsv([cells]),
      });
      continue;
    }

    const payload: ItemPayloadLike = {};
    const username = cell(cells, c.username);
    const password = cell(cells, c.password);
    const totp = cell(cells, c.totp).trim();
    const urls = splitUrls(cell(cells, c.url));
    if (username) payload.username = username;
    if (password) payload.password = password;
    if (totp) payload.totpSecret = totp;
    if (urls.length > 0) payload.urls = urls;

    const notes = cell(cells, c.extra).trim();
    const folder = cell(cells, c.grouping).trim();

    const record: TransferRecord = {
      type: "login",
      name,
      payload,
      favorite: parseBoolean(field(cells, c.fav)),
    };
    if (notes) record.notes = notes;
    if (folder) record.folder = folder;
    records.push(record);
  }

  return records;
}
