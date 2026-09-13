"use client";

import { Badge } from "@/components/ui/feedback";
import { Button, IconButton } from "@/components/ui/button";
import type {
  CardPayload,
  DecryptedItem,
  IdentityPayload,
  LoginPayload,
  SecureNotePayload,
} from "@/lib/client/types";
import { BackIcon, TrashIcon } from "@/components/app/shell/Icons";
import { ValueRow, SecretRow } from "./SecretField";
import { TypeGlyph } from "./TypeGlyph";
import { formatDateTime, typeLabel } from "./meta";

type RowSpec =
  | {
      kind: "value";
      label: string;
      value: string;
      mono?: boolean;
      multiline?: boolean;
    }
  | { kind: "secret"; label: string; value: string };

function rowsFor(item: DecryptedItem): RowSpec[] {
  const rows: RowSpec[] = [];

  if (item.type === "login") {
    const data = item.data as LoginPayload;
    if (data.username) {
      rows.push({ kind: "value", label: "Username", value: data.username });
    }
    if (data.password) {
      rows.push({ kind: "secret", label: "Password", value: data.password });
    }
    if (data.totp) {
      rows.push({ kind: "secret", label: "One-time code", value: data.totp });
    }
    for (const url of data.urls ?? []) {
      rows.push({ kind: "value", label: "Website", value: url });
    }
    for (const field of data.custom ?? []) {
      rows.push(
        field.secret
          ? { kind: "secret", label: field.label, value: field.value }
          : { kind: "value", label: field.label, value: field.value },
      );
    }
  }

  if (item.type === "card") {
    const data = item.data as CardPayload;
    if (data.brand) {
      rows.push({ kind: "value", label: "Brand", value: data.brand });
    }
    if (data.holder) {
      rows.push({ kind: "value", label: "Cardholder", value: data.holder });
    }
    if (data.number) {
      rows.push({ kind: "secret", label: "Card number", value: data.number });
    }
    if (data.expiry) {
      rows.push({ kind: "value", label: "Expiry", value: data.expiry });
    }
    if (data.cvv) {
      rows.push({ kind: "secret", label: "Security code", value: data.cvv });
    }
  }

  if (item.type === "identity") {
    const data = item.data as IdentityPayload;
    if (data.fullName) {
      rows.push({ kind: "value", label: "Name", value: data.fullName });
    }
    if (data.email) {
      rows.push({ kind: "value", label: "Email", value: data.email });
    }
    if (data.phone) {
      rows.push({ kind: "value", label: "Phone", value: data.phone });
    }
    if (data.address) {
      rows.push({
        kind: "value",
        label: "Address",
        value: data.address,
        multiline: true,
      });
    }
  }

  if (item.type === "secure_note") {
    const data = item.data as SecureNotePayload;
    if (data.body) {
      rows.push({
        kind: "value",
        label: "Note",
        value: data.body,
        multiline: true,
      });
    }
  }

  return rows;
}

const DETAIL_HEADING: Record<DecryptedItem["type"], string> = {
  login: "Login details",
  card: "Card details",
  identity: "Identity details",
  secure_note: "Secure note",
};

export interface ItemInspectorProps {
  item: DecryptedItem;
  folderName: string | null;
  favoriteBusy: boolean;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onTrash: () => void;
  onBack: () => void;
}

export function ItemInspector({
  item,
  folderName,
  favoriteBusy,
  onEdit,
  onToggleFavorite,
  onTrash,
  onBack,
}: ItemInspectorProps) {
  const rows = rowsFor(item);

  return (
    <article className="rounded-lg border border-line bg-surface">
      <header className="flex items-start gap-3 px-4 py-3">
        <TypeGlyph type={item.type} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[15px] font-semibold text-ink"
            title={item.name}
          >
            {item.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{typeLabel(item.type)}</Badge>
            {item.favorite ? <Badge tone="accent">Favorite</Badge> : null}
            <span className="min-w-0 truncate text-[12.5px] text-ink-faint">
              {folderName ?? "No folder"}
            </span>
          </div>
        </div>
        <IconButton
          label="Back to items"
          onClick={onBack}
          className="min-h-11 min-w-11 min-[1180px]:hidden"
        >
          <BackIcon className="size-4" />
        </IconButton>
      </header>

      <section
        aria-labelledby="ahaai-inspector-details"
        className="border-t border-line px-4 py-3"
      >
        <h3
          id="ahaai-inspector-details"
          className="text-[12.5px] font-medium text-ink-muted"
        >
          {DETAIL_HEADING[item.type]}
        </h3>

        {rows.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-faint">
            No fields saved yet. Edit this item to add them.
          </p>
        ) : (
          <div className="mt-2">
            {rows.map((row, index) =>
              row.kind === "secret" ? (
                <SecretRow
                  key={`${row.label}-${index}`}
                  label={row.label}
                  value={row.value}
                />
              ) : (
                <ValueRow
                  key={`${row.label}-${index}`}
                  label={row.label}
                  value={row.value}
                  mono={row.mono}
                  multiline={row.multiline}
                />
              ),
            )}
          </div>
        )}
      </section>

      {item.notes ? (
        <div className="border-t border-line px-4 py-3">
          <ValueRow label="Notes" value={item.notes} multiline />
        </div>
      ) : null}

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-4 py-3 text-[12.5px]">
        <div className="flex items-center gap-2">
          <dt className="text-ink-faint">Revision</dt>
          <dd className="mono-data text-ink-muted">{item.revision}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-ink-faint">Updated</dt>
          <dd className="mono-data text-ink-muted">
            {formatDateTime(item.updatedAt)}
          </dd>
        </div>
      </dl>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" onClick={onEdit}>
          Edit item
        </Button>
        <Button
          onClick={onToggleFavorite}
          aria-pressed={item.favorite}
          disabled={favoriteBusy}
        >
          {item.favorite ? "Remove from favorites" : "Add to favorites"}
        </Button>
        <Button variant="ghost" onClick={onTrash}>
          <TrashIcon className="size-4" />
          Move to trash
        </Button>
      </footer>
    </article>
  );
}
