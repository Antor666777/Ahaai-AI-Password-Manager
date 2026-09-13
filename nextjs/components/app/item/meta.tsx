import type {
  CardPayload,
  CustomField,
  DecryptedItem,
  IdentityPayload,
  ItemPayload,
  ItemType,
  LoginPayload,
  SecureNotePayload,
} from "@/lib/client/types";

export const ITEM_TYPES: ItemType[] = [
  "login",
  "card",
  "identity",
  "secure_note",
];

const TYPE_LABEL: Record<ItemType, string> = {
  login: "Login",
  card: "Card",
  identity: "Identity",
  secure_note: "Secure note",
};

export function typeLabel(type: ItemType): string {
  return TYPE_LABEL[type];
}

export function isItemType(value: string | null): value is ItemType {
  return value !== null && (ITEM_TYPES as string[]).includes(value);
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Items only render after the vault decrypts in the browser, so this never
 *  runs during server rendering and cannot drift from the server locale. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return DATE_TIME.format(date);
}

/** Every editable field for every type, so switching type never loses input. */
export interface DraftFields {
  type: ItemType;
  name: string;
  notes: string;
  /** Empty string means "no folder". */
  folderId: string;
  favorite: boolean;
  username: string;
  password: string;
  totp: string;
  /** One address per line. */
  urls: string;
  cardBrand: string;
  cardHolder: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  body: string;
}

export function emptyFields(type: ItemType): DraftFields {
  return {
    type,
    name: "",
    notes: "",
    folderId: "",
    favorite: false,
    username: "",
    password: "",
    totp: "",
    urls: "",
    cardBrand: "",
    cardHolder: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
    fullName: "",
    email: "",
    phone: "",
    address: "",
    body: "",
  };
}

function splitUrls(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function customFieldsOf(item: DecryptedItem): CustomField[] {
  if (item.type !== "login") return [];
  const data = item.data as LoginPayload;
  return data.custom ?? [];
}

export function fieldsFromItem(item: DecryptedItem): DraftFields {
  const fields = emptyFields(item.type);
  fields.name = item.name;
  fields.notes = item.notes;
  fields.folderId = item.folderId ?? "";
  fields.favorite = item.favorite;

  switch (item.type) {
    case "login": {
      const data = item.data as LoginPayload;
      fields.username = data.username ?? "";
      fields.password = data.password ?? "";
      fields.totp = data.totp ?? "";
      fields.urls = (data.urls ?? []).join("\n");
      break;
    }
    case "card": {
      const data = item.data as CardPayload;
      fields.cardBrand = data.brand ?? "";
      fields.cardHolder = data.holder ?? "";
      fields.cardNumber = data.number ?? "";
      fields.cardExpiry = data.expiry ?? "";
      fields.cardCvv = data.cvv ?? "";
      break;
    }
    case "identity": {
      const data = item.data as IdentityPayload;
      fields.fullName = data.fullName ?? "";
      fields.email = data.email ?? "";
      fields.phone = data.phone ?? "";
      fields.address = data.address ?? "";
      break;
    }
    case "secure_note": {
      const data = item.data as SecureNotePayload;
      fields.body = data.body ?? "";
      break;
    }
  }

  return fields;
}

/** Drops empty fields so the payload stays as small as the input allows. */
export function buildPayload(
  fields: DraftFields,
  custom: CustomField[],
): ItemPayload {
  switch (fields.type) {
    case "login": {
      const payload: LoginPayload = {};
      if (fields.username.trim()) payload.username = fields.username.trim();
      if (fields.password) payload.password = fields.password;
      if (fields.totp.trim()) payload.totp = fields.totp.trim();
      const urls = splitUrls(fields.urls);
      if (urls.length > 0) payload.urls = urls;
      if (custom.length > 0) payload.custom = custom;
      return payload;
    }
    case "card": {
      const payload: CardPayload = {};
      if (fields.cardBrand.trim()) payload.brand = fields.cardBrand.trim();
      if (fields.cardHolder.trim()) payload.holder = fields.cardHolder.trim();
      if (fields.cardNumber.trim()) payload.number = fields.cardNumber.trim();
      if (fields.cardExpiry.trim()) payload.expiry = fields.cardExpiry.trim();
      if (fields.cardCvv) payload.cvv = fields.cardCvv;
      return payload;
    }
    case "identity": {
      const payload: IdentityPayload = {};
      if (fields.fullName.trim()) payload.fullName = fields.fullName.trim();
      if (fields.email.trim()) payload.email = fields.email.trim();
      if (fields.phone.trim()) payload.phone = fields.phone.trim();
      if (fields.address.trim()) payload.address = fields.address.trim();
      return payload;
    }
    case "secure_note": {
      const payload: SecureNotePayload = {};
      if (fields.body.trim()) payload.body = fields.body;
      return payload;
    }
  }
}
