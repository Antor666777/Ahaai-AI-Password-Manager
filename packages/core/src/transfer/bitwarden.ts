import {
  cell,
  columnIndex,
  field,
  hasColumn,
  isBlankRow,
  serializeCsv,
  type CsvDocument,
} from "./csv";
import {
  combineExpiry,
  combineName,
  mapItemType,
  parseBoolean,
  parseCustomFields,
  splitAddress,
  splitUrls,
} from "./shared";
import type {
  ItemPayloadLike,
  SkipCollector,
  TransferRecord,
} from "./types";

/**
 * Bitwarden CSV export.
 *
 * Header (logins): `folder,favorite,type,name,notes,fields,reprompt,
 * login_uri,login_username,login_password,login_totp`, plus `card_*` and
 * `identity_*` columns. The `fields` column packs custom fields as
 * `Label: value` lines, which is why it can contain embedded newlines.
 */
export function detect(header: string[]): boolean {
  // Keyed on the `login_*` columns only: a Bitwarden export always carries the
  // full header even when it holds no logins, and the generic CSV uses plain
  // `card_number` / `username`, which must not be caught here.
  return hasColumn(
    header,
    "login_uri",
    "login_username",
    "login_password",
    "login_totp",
  );
}

export function parse(
  doc: CsvDocument,
  onSkip: SkipCollector = () => {},
): TransferRecord[] {
  const c = {
    folder: columnIndex(doc.header, "folder"),
    favorite: columnIndex(doc.header, "favorite"),
    type: columnIndex(doc.header, "type"),
    name: columnIndex(doc.header, "name"),
    notes: columnIndex(doc.header, "notes"),
    fields: columnIndex(doc.header, "fields"),
    uri: columnIndex(doc.header, "login_uri"),
    username: columnIndex(doc.header, "login_username"),
    password: columnIndex(doc.header, "login_password"),
    totp: columnIndex(doc.header, "login_totp"),
    cardBrand: columnIndex(doc.header, "card_brand"),
    cardHolder: columnIndex(doc.header, "card_holder_name"),
    cardNumber: columnIndex(doc.header, "card_number"),
    cardMonth: columnIndex(doc.header, "card_exp_month"),
    cardYear: columnIndex(doc.header, "card_exp_year"),
    cardCode: columnIndex(doc.header, "card_code"),
    idFirst: columnIndex(doc.header, "identity_first_name"),
    idLast: columnIndex(doc.header, "identity_last_name"),
    idEmail: columnIndex(doc.header, "identity_email"),
    idPhone: columnIndex(doc.header, "identity_phone"),
    idAddress: columnIndex(doc.header, "identity_address1"),
    idCity: columnIndex(doc.header, "identity_city"),
    idState: columnIndex(doc.header, "identity_state"),
    idPostal: columnIndex(doc.header, "identity_postal_code"),
    idCountry: columnIndex(doc.header, "identity_country"),
  };

  const records: TransferRecord[] = [];

  for (const row of doc.rows) {
    const cells = row.cells;
    if (isBlankRow(cells)) continue;

    const name = cell(cells, c.name).trim();
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
      const code = cell(cells, c.cardCode).trim();
      const brand = cell(cells, c.cardBrand).trim();
      const expiry = combineExpiry(
        field(cells, c.cardMonth),
        field(cells, c.cardYear),
      );
      if (holder) payload.holder = holder;
      if (number) payload.number = number;
      if (code) payload.cvv = code;
      if (brand) payload.brand = brand;
      if (expiry) payload.expiry = expiry;
    } else if (type === "identity") {
      const fullName = combineName(
        cell(cells, c.idFirst),
        cell(cells, c.idLast),
      );
      const email = cell(cells, c.idEmail).trim();
      const phone = cell(cells, c.idPhone).trim();
      const address = splitAddress([
        cell(cells, c.idAddress),
        cell(cells, c.idCity),
        cell(cells, c.idState),
        cell(cells, c.idPostal),
        cell(cells, c.idCountry),
      ]);
      if (fullName) payload.fullName = fullName;
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      if (address) payload.address = address;
    } else if (type === "secure_note") {
      // Bitwarden keeps a secure note's body in the same `notes` column, so the
      // content becomes the body and the generic notes field stays empty.
      if (notes) payload.body = notes;
    } else {
      const username = cell(cells, c.username);
      const password = cell(cells, c.password);
      const totp = cell(cells, c.totp).trim();
      const uris = splitUrls(cell(cells, c.uri));
      if (username) payload.username = username;
      if (password) payload.password = password;
      if (totp) payload.totpSecret = totp;
      if (uris.length > 0) payload.urls = uris;
    }

    const custom = parseCustomFields(cell(cells, c.fields));
    if (custom.length > 0) payload.custom = custom;

    const folder = cell(cells, c.folder).trim();
    const record: TransferRecord = {
      type,
      name,
      payload,
      favorite: parseBoolean(cell(cells, c.favorite)),
    };
    if (type !== "secure_note" && notes) record.notes = notes;
    if (folder) record.folder = folder;
    records.push(record);
  }

  return records;
}
