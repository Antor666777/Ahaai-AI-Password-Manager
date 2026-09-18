"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Callout } from "@/components/ui/feedback";
import {
  PasswordField,
  SelectField,
  TextArea,
  TextInput,
} from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { ApiError } from "@/lib/client/api";
import { generatePassword } from "@/lib/client/crypto";
import { useToast } from "@/lib/client/toast";
import { useVault, type ItemDraft } from "@/lib/client/vault";
import type { DecryptedItem, ItemType } from "@/lib/client/types";
import {
  ITEM_TYPES,
  buildPayload,
  customFieldsOf,
  emptyFields,
  fieldsFromItem,
  isItemType,
  normalizeTotpInput,
  typeLabel,
  type DraftFields,
} from "./meta";

export interface ItemEditorProps {
  /** Null creates a new item; an item edits it in place. */
  item: DecryptedItem | null;
  defaultFolderId: string | null;
  /** Used only when creating, so a filtered list keeps filling with one type. */
  defaultType?: ItemType;
  onClose: () => void;
  onSaved: (item: DecryptedItem) => void;
}

export function ItemEditor({
  item,
  defaultFolderId,
  defaultType,
  onClose,
  onSaved,
}: ItemEditorProps) {
  const vault = useVault();
  const toast = useToast();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const custom = item ? customFieldsOf(item) : [];

  const [fields, setFields] = useState<DraftFields>(() =>
    item
      ? fieldsFromItem(item)
      : {
          ...emptyFields(defaultType ?? "login"),
          folderId: defaultFolderId ?? "",
        },
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    setConflict(false);

    const name = fields.name.trim();
    if (name.length === 0) {
      setNameError("Give this item a name so you can find it later.");
      nameRef.current?.focus();
      return;
    }
    setNameError(null);

    const totp = normalizeTotpInput(fields.totp);
    if (!totp.ok) {
      setTotpError(totp.error ?? "Enter a usable two-factor secret.");
      return;
    }
    setTotpError(null);

    const draft: ItemDraft = {
      type: fields.type,
      name,
      notes: fields.notes,
      data: buildPayload(fields, custom),
      folderId: fields.folderId === "" ? null : fields.folderId,
      favorite: fields.favorite,
    };

    setSaving(true);
    try {
      const saved = item
        ? await vault.updateItem(item.id, draft)
        : await vault.createItem(draft);
      toast.success(item ? "Item saved" : "Item created", name);
      onSaved(saved);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "CONFLICT") {
        setConflict(true);
      } else {
        setFormError(
          caught instanceof Error
            ? caught.message
            : "The item was not saved. Try again in a moment.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  /** Picks up the newer revision so the next save applies cleanly. */
  async function handleReload() {
    setReloading(true);
    try {
      await vault.reload();
      setConflict(false);
    } finally {
      setReloading(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={item ? "Edit item" : "New item"}
      description={
        item
          ? "Change any field, then save. Ahaai seals it again before it leaves this tab."
          : "Pick a type, fill in what you have, and save. Ahaai seals it before it leaves this tab."
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {item ? "Save changes" : "Create item"}
          </Button>
        </>
      }
    >
      <div className="max-h-[68dvh] space-y-4 overflow-y-auto pe-1">
        <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-4">
            <TextInput
              ref={nameRef}
              label="Name"
              name="name"
              required
              value={fields.name}
              disabled={saving}
              placeholder="Water utility"
              error={nameError}
              onChange={(event) => {
                update("name", event.target.value);
                if (nameError) setNameError(null);
              }}
            />

            <SelectField
              label="Type"
              name="type"
              value={fields.type}
              disabled={saving}
              onChange={(event) => {
                if (isItemType(event.target.value)) {
                  update("type", event.target.value);
                }
              }}
            >
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="space-y-4 border-t border-line pt-4">
            {fields.type === "login" ? (
              <>
                <TextInput
                  label="Username"
                  name="username"
                  autoComplete="username"
                  spellCheck={false}
                  value={fields.username}
                  disabled={saving}
                  onChange={(event) => update("username", event.target.value)}
                />

                <div className="space-y-2">
                  <PasswordField
                    label="Password"
                    name="password"
                    autoComplete="new-password"
                    value={fields.password}
                    disabled={saving}
                    onChange={(value) => update("password", value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => update("password", generatePassword())}
                    >
                      Generate password
                    </Button>
                  </div>
                </div>

                <PasswordField
                  label="Two-factor secret"
                  name="totp"
                  autoComplete="off"
                  hint="Paste the base32 secret or the otpauth:// link from your authenticator app. Ahaai generates the live code, so the rotating code itself is not needed."
                  value={fields.totp}
                  disabled={saving}
                  error={totpError}
                  onChange={(value) => {
                    update("totp", value);
                    const result = normalizeTotpInput(value);
                    setTotpError(result.ok ? null : (result.error ?? null));
                  }}
                />

                <TextArea
                  label="Websites"
                  name="urls"
                  spellCheck={false}
                  hint="One address per line."
                  value={fields.urls}
                  disabled={saving}
                  onChange={(event) => update("urls", event.target.value)}
                />
              </>
            ) : null}

            {fields.type === "card" ? (
              <>
                <TextInput
                  label="Brand"
                  name="card-brand"
                  placeholder="Visa"
                  value={fields.cardBrand}
                  disabled={saving}
                  onChange={(event) => update("cardBrand", event.target.value)}
                />
                <TextInput
                  label="Cardholder"
                  name="card-holder"
                  autoComplete="cc-name"
                  value={fields.cardHolder}
                  disabled={saving}
                  onChange={(event) => update("cardHolder", event.target.value)}
                />
                <PasswordField
                  label="Card number"
                  name="card-number"
                  autoComplete="cc-number"
                  value={fields.cardNumber}
                  disabled={saving}
                  onChange={(value) => update("cardNumber", value)}
                />
                <TextInput
                  label="Expiry"
                  name="card-expiry"
                  autoComplete="cc-exp"
                  placeholder="MM / YY"
                  value={fields.cardExpiry}
                  disabled={saving}
                  onChange={(event) => update("cardExpiry", event.target.value)}
                />
                <PasswordField
                  label="Security code"
                  name="card-cvv"
                  autoComplete="cc-csc"
                  value={fields.cardCvv}
                  disabled={saving}
                  onChange={(value) => update("cardCvv", value)}
                />
              </>
            ) : null}

            {fields.type === "identity" ? (
              <>
                <TextInput
                  label="Name"
                  name="identity-name"
                  autoComplete="name"
                  value={fields.fullName}
                  disabled={saving}
                  onChange={(event) => update("fullName", event.target.value)}
                />
                <TextInput
                  label="Email"
                  name="identity-email"
                  type="email"
                  autoComplete="email"
                  value={fields.email}
                  disabled={saving}
                  onChange={(event) => update("email", event.target.value)}
                />
                <TextInput
                  label="Phone"
                  name="identity-phone"
                  type="tel"
                  autoComplete="tel"
                  value={fields.phone}
                  disabled={saving}
                  onChange={(event) => update("phone", event.target.value)}
                />
                <TextArea
                  label="Address"
                  name="identity-address"
                  autoComplete="street-address"
                  value={fields.address}
                  disabled={saving}
                  onChange={(event) => update("address", event.target.value)}
                />
              </>
            ) : null}

            {fields.type === "secure_note" ? (
              <TextArea
                label="Note"
                name="note-body"
                value={fields.body}
                disabled={saving}
                onChange={(event) => update("body", event.target.value)}
              />
            ) : null}
          </div>

          <div className="space-y-4 border-t border-line pt-4">
            <SelectField
              label="Folder"
              name="folder"
              value={fields.folderId}
              disabled={saving}
              onChange={(event) => update("folderId", event.target.value)}
            >
              <option value="">No folder</option>
              {vault.folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </SelectField>

            <Switch
              label="Add to favorites"
              description="Shows up first when you browse the vault."
              checked={fields.favorite}
              disabled={saving}
              onChange={(checked) => update("favorite", checked)}
            />

            <TextArea
              label="Notes"
              name="notes"
              value={fields.notes}
              disabled={saving}
              onChange={(event) => update("notes", event.target.value)}
            />
          </div>
        </form>

        {conflict ? (
          <div role="alert">
            <Callout tone="warning" title="This item changed somewhere else">
              <p>
                Another tab or device saved this item after you opened it, so
                Ahaai stopped your save to protect that newer version. Your edits
                are still here. Reload the vault, then save again to apply them.
              </p>
              <div className="mt-3">
                <Button size="sm" onClick={handleReload} loading={reloading}>
                  Reload the vault
                </Button>
              </div>
            </Callout>
          </div>
        ) : null}

        {formError ? (
          <div role="alert">
            <Callout tone="danger" title="Item was not saved">
              {formError}
            </Callout>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
