import {
  cell,
  columnIndex,
  field,
  isBlankRow,
  readCsv,
  serializeCsv,
  type CsvDocument,
} from "./csv";
import {
  joinUrls,
  mapItemType,
  parseBoolean,
  serializeCustomFields,
  splitExpiry,
  splitName,
  splitUrls,
} from "./shared";
import * as bitwarden from "./bitwarden";
import * as keepass from "./keepass";
import * as lastpass from "./lastpass";
import * as onepassword from "./onepassword";
import {
  TransferError,
  type ImportFormat,
  type ItemPayloadLike,
  type SkipCollector,
  type SkippedRow,
  type TransferFormat,
  type TransferItemType,
  type TransferRecord,
} from "./types";

export * from "./types";
export { parseCsv, serializeCsv } from "./csv";

interface VendorMapper {
  format: TransferFormat;
  detect: (header: string[]) => boolean;
  parse: (doc: CsvDocument, onSkip: SkipCollector) => TransferRecord[];
}

/**
 * Detection order matters: each `detect` keys on a header shape that is unique
 * to one tool, so the first match can win outright rather than scoring.
 */
const VENDOR_MAPPERS: VendorMapper[] = [
  { format: "bitwarden", detect: bitwarden.detect, parse: bitwarden.parse },
  { format: "lastpass", detect: lastpass.detect, parse: lastpass.parse },
  { format: "onepassword", detect: onepassword.detect, parse: onepassword.parse },
  { format: "keepass", detect: keepass.detect, parse: keepass.parse },
];

export function detectFormat(header: string[]): TransferFormat {
  for (const mapper of VENDOR_MAPPERS) {
    if (mapper.detect(header)) return mapper.format;
  }
  return "generic";
}

export interface ParseImportResult {
  records: TransferRecord[];
  skipped: SkippedRow[];
  format: TransferFormat;
}

/**
 * Parses an import file. With `format: "auto"` (the default) the header row is
 * sniffed; an explicit format forces one mapper. A malformed row is collected
 * into `skipped` rather than aborting the file; only a file that cannot be
 * interpreted at all (empty, or no name column) throws.
 */
export function parseImport(
  content: string,
  format: ImportFormat = "auto",
): ParseImportResult {
  const doc = readCsv(content);
  if (doc.header.length === 0 || (doc.header.length === 1 && doc.header[0] === "")) {
    throw new TransferError("The file is empty or has no header row.");
  }

  const resolved: TransferFormat =
    format === "auto" ? detectFormat(doc.header) : format;

  const skipped: SkippedRow[] = [];
  const collect: SkipCollector = (row) => skipped.push(row);

  let records: TransferRecord[];
  if (resolved === "generic") {
    records = parseGeneric(doc, collect);
  } else {
    const mapper = VENDOR_MAPPERS.find((entry) => entry.format === resolved);
    records = mapper ? mapper.parse(doc, collect) : parseGeneric(doc, collect);
  }

  return { records, skipped, format: resolved };
}

/**
 * The generic CSV carries tags in one cell. They are joined with a newline,
 * which a single-line tag field cannot produce, so no tag name can contain the
 * separator. `serializeCsv` quotes the cell and `readCsv` hands it back whole,
 * so the round trip is exact.
 */
const TAG_SEPARATOR = "\n";

function joinTags(tags: string[] | undefined): string {
  return (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .join(TAG_SEPARATOR);
}

function splitTags(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Fallback mapper for an unknown header. It is also the reader for the output
 * of `toGenericCsv`, so the two round-trip. Column names are matched by alias
 * (`name`/`title`/`account`, `urls`/`url`/`web site`, `tags`/`tag`, ...).
 */
function parseGeneric(doc: CsvDocument, onSkip: SkipCollector): TransferRecord[] {
  const nameIndex = columnIndex(doc.header, "name", "title", "account");
  if (nameIndex === -1) {
    throw new TransferError(
      "This file has no recognisable name column, so it is not a supported export.",
    );
  }

  const c = {
    type: columnIndex(doc.header, "type"),
    notes: columnIndex(doc.header, "notes", "extra", "comments"),
    folder: columnIndex(doc.header, "folder", "group", "grouping"),
    tags: columnIndex(doc.header, "tags", "tag"),
    username: columnIndex(doc.header, "username", "login name"),
    password: columnIndex(doc.header, "password"),
    totp: columnIndex(doc.header, "totp", "otpauth"),
    urls: columnIndex(doc.header, "urls", "url", "web site", "login_uri"),
    cardHolder: columnIndex(doc.header, "card_holder", "card_holder_name"),
    cardNumber: columnIndex(doc.header, "card_number"),
    cardExpiry: columnIndex(doc.header, "card_expiry"),
    cardCode: columnIndex(doc.header, "card_code", "card_cvv"),
    cardBrand: columnIndex(doc.header, "card_brand"),
    fullName: columnIndex(doc.header, "identity_name", "full_name", "fullname"),
    email: columnIndex(doc.header, "identity_email", "email"),
    phone: columnIndex(doc.header, "identity_phone", "phone"),
    address: columnIndex(doc.header, "identity_address", "address"),
    body: columnIndex(doc.header, "body"),
    favorite: columnIndex(doc.header, "favorite", "fav"),
  };

  const records: TransferRecord[] = [];

  for (const row of doc.rows) {
    const cells = row.cells;
    if (isBlankRow(cells)) continue;

    const name = cell(cells, nameIndex).trim();
    if (name.length === 0) {
      onSkip({ line: row.line, reason: "Missing name", raw: serializeCsv([cells]) });
      continue;
    }

    const type = mapItemType(field(cells, c.type));
    const notes = cell(cells, c.notes).trim();
    const payload: ItemPayloadLike = {};

    if (type === "card") {
      const holder = cell(cells, c.cardHolder).trim();
      const number = cell(cells, c.cardNumber).trim();
      const expiry = cell(cells, c.cardExpiry).trim();
      const cvv = cell(cells, c.cardCode).trim();
      const brand = cell(cells, c.cardBrand).trim();
      if (holder) payload.holder = holder;
      if (number) payload.number = number;
      if (expiry) payload.expiry = expiry;
      if (cvv) payload.cvv = cvv;
      if (brand) payload.brand = brand;
    } else if (type === "identity") {
      const fullName = cell(cells, c.fullName).trim();
      const email = cell(cells, c.email).trim();
      const phone = cell(cells, c.phone).trim();
      const address = cell(cells, c.address).trim();
      if (fullName) payload.fullName = fullName;
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      if (address) payload.address = address;
    } else if (type === "secure_note") {
      const body = cell(cells, c.body).trim() || notes;
      if (body) payload.body = body;
    } else {
      const username = cell(cells, c.username);
      const password = cell(cells, c.password);
      const totp = cell(cells, c.totp).trim();
      const urls = splitUrls(cell(cells, c.urls));
      if (username) payload.username = username;
      if (password) payload.password = password;
      if (totp) payload.totpSecret = totp;
      if (urls.length > 0) payload.urls = urls;
    }

    const folder = cell(cells, c.folder).trim();
    const tags = splitTags(cell(cells, c.tags));
    const record: TransferRecord = {
      type,
      name,
      payload,
      favorite: parseBoolean(cell(cells, c.favorite)),
    };
    if (notes) record.notes = notes;
    if (folder) record.folder = folder;
    if (tags.length > 0) record.tags = tags;
    records.push(record);
  }

  return records;
}

const BITWARDEN_HEADER = [
  "folder",
  "favorite",
  "type",
  "name",
  "notes",
  "fields",
  "reprompt",
  "login_uri",
  "login_username",
  "login_password",
  "login_totp",
  "card_brand",
  "card_holder_name",
  "card_number",
  "card_exp_month",
  "card_exp_year",
  "card_code",
  "identity_first_name",
  "identity_last_name",
  "identity_email",
  "identity_phone",
  "identity_address1",
];

function bitwardenType(type: TransferItemType): string {
  return type === "secure_note" ? "note" : type;
}

function bitwardenRow(record: TransferRecord): string[] {
  const payload = record.payload;
  const expiry = splitExpiry(payload.expiry);
  const name = splitName(payload.fullName);
  // Bitwarden has a single notes column; a secure note's body lives there.
  const notes =
    record.type === "secure_note"
      ? payload.body ?? record.notes ?? ""
      : record.notes ?? "";

  return [
    record.folder ?? "",
    record.favorite ? "1" : "0",
    bitwardenType(record.type),
    record.name,
    notes,
    serializeCustomFields(payload.custom),
    "0",
    joinUrls(payload.urls),
    payload.username ?? "",
    payload.password ?? "",
    payload.totpSecret ?? "",
    payload.brand ?? "",
    payload.holder ?? "",
    payload.number ?? "",
    expiry.month,
    expiry.year,
    payload.cvv ?? "",
    name.first,
    name.last,
    payload.email ?? "",
    payload.phone ?? "",
    payload.address ?? "",
  ];
}

/**
 * Bitwarden-compatible CSV. The header follows Bitwarden's own export so the
 * file round-trips through `parseImport` and can be handed to Bitwarden's
 * importer. Identity is flattened to first/last name and the two card expiry
 * columns, which is the grain Bitwarden itself uses.
 *
 * Lossy for tags: Bitwarden's CSV has no tag column, so `record.tags` is
 * dropped rather than smuggled into `folder` or `notes`. A tag-fidelity export
 * is `toGenericCsv` instead.
 */
export function toBitwardenCsv(records: TransferRecord[]): string {
  return serializeCsv([BITWARDEN_HEADER, ...records.map(bitwardenRow)]);
}

const GENERIC_HEADER = [
  "type",
  "name",
  "favorite",
  "notes",
  "folder",
  "tags",
  "username",
  "password",
  "totp",
  "urls",
  "card_holder",
  "card_number",
  "card_expiry",
  "card_code",
  "card_brand",
  "identity_name",
  "identity_email",
  "identity_phone",
  "identity_address",
  "body",
];

function genericRow(record: TransferRecord): string[] {
  const payload = record.payload;
  return [
    record.type,
    record.name,
    record.favorite ? "1" : "0",
    record.notes ?? "",
    record.folder ?? "",
    joinTags(record.tags),
    payload.username ?? "",
    payload.password ?? "",
    payload.totpSecret ?? "",
    joinUrls(payload.urls),
    payload.holder ?? "",
    payload.number ?? "",
    payload.expiry ?? "",
    payload.cvv ?? "",
    payload.brand ?? "",
    payload.fullName ?? "",
    payload.email ?? "",
    payload.phone ?? "",
    payload.address ?? "",
    payload.body ?? "",
  ];
}

/**
 * Plaintext, lossless-within-its-columns CSV. Round-trips through `parseImport`,
 * including `tags`, which travel in a newline-joined `tags` column.
 */
export function toGenericCsv(records: TransferRecord[]): string {
  return serializeCsv([GENERIC_HEADER, ...records.map(genericRow)]);
}
