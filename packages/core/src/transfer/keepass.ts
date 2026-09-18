import {
  cell,
  columnIndex,
  hasColumn,
  isBlankRow,
  serializeCsv,
  type CsvDocument,
} from "./csv";
import { splitUrls } from "./shared";
import type { ItemPayloadLike, SkipCollector, TransferRecord } from "./types";

/**
 * KeePass CSV export. Two layouts are accepted:
 *
 * - KeePassXC: `Group,Title,Username,Password,URL,Notes,TOTP,Icon,Last Modified,Created`.
 * - KeePass 2.x classic: `Account,Login Name,Password,Web Site,Comments`.
 *
 * The first column is the title in one layout and the account name in the
 * other, which is why detection keys on `Group` / `Account` and parse picks a
 * layout before it reads any row.
 */
export function detect(header: string[]): boolean {
  if (hasColumn(header, "group") && hasColumn(header, "title")) return true;
  return hasColumn(header, "account") && hasColumn(header, "login name");
}

export function parse(
  doc: CsvDocument,
  onSkip: SkipCollector = () => {},
): TransferRecord[] {
  const classic = !hasColumn(doc.header, "title");
  const c = classic
    ? {
        title: columnIndex(doc.header, "account"),
        username: columnIndex(doc.header, "login name"),
        password: columnIndex(doc.header, "password"),
        url: columnIndex(doc.header, "web site"),
        notes: columnIndex(doc.header, "comments"),
        totp: -1,
        group: -1,
      }
    : {
        title: columnIndex(doc.header, "title"),
        username: columnIndex(doc.header, "username"),
        password: columnIndex(doc.header, "password"),
        url: columnIndex(doc.header, "url"),
        notes: columnIndex(doc.header, "notes"),
        totp: columnIndex(doc.header, "totp"),
        group: columnIndex(doc.header, "group"),
      };

  const records: TransferRecord[] = [];

  for (const row of doc.rows) {
    const cells = row.cells;
    if (isBlankRow(cells)) continue;

    const name = cell(cells, c.title).trim();
    if (name.length === 0) {
      onSkip({
        line: row.line,
        reason: classic ? "Missing account name" : "Missing title",
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

    const notes = cell(cells, c.notes).trim();
    const folder = cell(cells, c.group).trim();

    const record: TransferRecord = { type: "login", name, payload };
    if (notes) record.notes = notes;
    if (folder) record.folder = folder;
    records.push(record);
  }

  return records;
}
