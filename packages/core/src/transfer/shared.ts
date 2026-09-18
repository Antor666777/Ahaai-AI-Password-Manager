/**
 * Small value helpers shared by the vendor mappers. They interpret the text
 * inside a cell; nothing here touches the file or the network.
 */
import type { TransferCustomField, TransferItemType } from "./types";

export function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Splits a multi-URI cell on newlines or commas, dropping empties. */
export function splitUrls(value: string): string[] {
  return value
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function joinUrls(urls: string[] | undefined): string {
  return (urls ?? []).filter((url) => url.trim().length > 0).join("\n");
}

/**
 * "Ada Lovelace" -> first "Ada", last "Lovelace". Only the first space splits,
 * so a middle name stays attached to the surname.
 */
export function splitName(fullName: string | undefined): {
  first: string;
  last: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function combineName(first: string, last: string): string {
  return [first, last]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export function splitAddress(parts: (string | undefined)[]): string | undefined {
  const value = parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return value.length > 0 ? value : undefined;
}

/** Bitwarden `fields` column: `Label: value`, one custom field per line. */
export function parseCustomFields(value: string): TransferCustomField[] {
  const fields: TransferCustomField[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      fields.push({ label: trimmed, value: "" });
      continue;
    }
    fields.push({
      label: trimmed.slice(0, separator).trim(),
      value: trimmed.slice(separator + 1).trim(),
    });
  }
  return fields;
}

export function serializeCustomFields(
  fields: TransferCustomField[] | undefined,
): string {
  return (fields ?? [])
    .filter((field) => field.label.trim().length > 0 || field.value.length > 0)
    .map((field) => `${field.label}: ${field.value}`)
    .join("\n");
}

/**
 * Maps a type cell to a neutral type. Accepts the Bitwarden names and numeric
 * enum, and unknown/empty values fall back to `login` (older login-only
 * exports omit the column value).
 */
export function mapItemType(value: string): TransferItemType {
  switch (value.trim().toLowerCase()) {
    case "card":
    case "3":
      return "card";
    case "identity":
    case "4":
      return "identity";
    case "note":
    case "secure_note":
    case "securenote":
    case "2":
      return "secure_note";
    case "login":
    case "1":
    default:
      return "login";
  }
}

export function splitExpiry(expiry: string | undefined): {
  month: string;
  year: string;
} {
  if (!expiry) return { month: "", year: "" };
  const [month = "", year = ""] = expiry.split(/[/-]/);
  return { month: month.trim(), year: year.trim() };
}

export function combineExpiry(month: string, year: string): string | undefined {
  const parts = [month.trim(), year.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join("/") : undefined;
}
