/**
 * RFC 4180 CSV reader and writer.
 *
 * A hand-written scanner instead of a regex or `split(",")`: a quoted field may
 * contain commas, double quotes and newlines, so the only correct way to read
 * the format is one character at a time with a quote state. It is also lenient
 * on purpose — CRLF and lone LF line breaks, a UTF-8 BOM, and a quote that
 * appears mid-field are all tolerated rather than rejected.
 */

const BOM = 0xfeff;

export interface CsvRow {
  cells: string[];
  /** 1-based record number, with the header counted as record 1. */
  line: number;
}

export interface CsvDocument {
  /** Header cells, trimmed. */
  header: string[];
  rows: CsvRow[];
}

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === BOM ? input.slice(1) : input;
  const rows: string[][] = [];

  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; ) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && !started) {
      inQuotes = true;
      started = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      started = false;
      i += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
      // CRLF is one break, not two empty rows.
      if (char === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
      continue;
    }

    field += char;
    started = true;
    i += 1;
  }

  // Flush the trailing field unless the file ended exactly on a line break,
  // which must not manufacture a spurious empty row.
  if (started || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n");
}

/** Parses a document and trims the header, which is all mappers key on. */
export function readCsv(content: string): CsvDocument {
  const table = parseCsv(content);
  const header = (table[0] ?? []).map((value) => value.trim());
  const rows: CsvRow[] = table.slice(1).map((cells, index) => ({
    cells,
    line: index + 2,
  }));
  return { header, rows };
}

/**
 * Case-insensitive header lookup that also tolerates stray whitespace, so
 * `Login Name` and `login name` resolve to the same column.
 */
export function columnIndex(header: string[], ...names: string[]): number {
  const wanted = names.map((name) => name.trim().toLowerCase());
  return header.findIndex((value) =>
    wanted.includes(value.trim().toLowerCase()),
  );
}

export function hasColumn(header: string[], ...names: string[]): boolean {
  return columnIndex(header, ...names) !== -1;
}

/**
 * A data cell, whitespace preserved: a password may legitimately start or end
 * with a space, so nothing here trims it away.
 */
export function cell(cells: string[], index: number): string {
  if (index < 0) return "";
  return cells[index] ?? "";
}

/** A structural cell (type, favorite, folder): safe to trim. */
export function field(cells: string[], index: number): string {
  return cell(cells, index).trim();
}

export function isBlankRow(cells: string[]): boolean {
  return cells.every((value) => value.trim().length === 0);
}
