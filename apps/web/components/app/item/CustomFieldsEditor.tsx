"use client";

import { useId } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { PasswordField, TextInput } from "@/components/ui/field";
import { CloseIcon, PlusIcon } from "@/components/app/shell/Icons";
import type { CustomField } from "@/lib/client/types";

/**
 * Repeats a label + value row for a login's custom fields, with a per-row
 * `secret` toggle and a remove button. There is no repeatable-row primitive in
 * the app, so this is built from the shared field, switch and button controls.
 *
 * Logins only: `CustomField` lives on `LoginPayload`, so cards, identities and
 * secure notes have nothing to repeat here. Do not add a custom field control
 * to those branches without moving the type onto a shared payload first.
 */
export interface CustomFieldsEditorProps {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  disabled?: boolean;
}

/** One row owns its own ids so two rows never share a label target. */
function CustomFieldRow({
  field,
  disabled,
  onChange,
  onRemove,
}: {
  field: CustomField;
  disabled: boolean;
  onChange: (patch: Partial<CustomField>) => void;
  onRemove: () => void;
}) {
  const rowId = useId();
  const labelId = `${rowId}-label`;
  const valueId = `${rowId}-value`;
  const secret = field.secret === true;

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface-2/40 p-3">
      <TextInput
        id={labelId}
        label="Field name"
        value={field.label}
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onChange({ label: event.target.value })}
      />

      {secret ? (
        <PasswordField
          id={valueId}
          label="Field value"
          autoComplete="off"
          value={field.value}
          disabled={disabled}
          onChange={(value) => onChange({ value })}
        />
      ) : (
        <TextInput
          id={valueId}
          label="Field value"
          autoComplete="off"
          value={field.value}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Switch
            id={`${rowId}-secret`}
            label="Keep this value secret"
            description="Shown masked in the item view, like a password."
            checked={secret}
            disabled={disabled}
            onChange={(checked) => onChange({ secret: checked })}
          />
        </div>
        <IconButton
          label={`Remove ${field.label || "field"}`}
          disabled={disabled}
          onClick={onRemove}
          className="min-h-11 min-w-11"
        >
          <CloseIcon className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

export function CustomFieldsEditor({
  fields,
  onChange,
  disabled = false,
}: CustomFieldsEditorProps) {
  const headingId = useId();

  function replace(index: number, patch: Partial<CustomField>) {
    onChange(fields.map((field, at) => (at === index ? { ...field, ...patch } : field)));
  }

  function remove(index: number) {
    onChange(fields.filter((_, at) => at !== index));
  }

  return (
    <div role="group" aria-labelledby={headingId} className="space-y-3">
      <div className="space-y-0.5">
        <p id={headingId} className="text-[13px] font-medium text-ink">
          Custom fields
        </p>
        <p className="text-[12.5px] leading-snug text-ink-faint">
          Extra values this login needs, for example a PIN or a support code. Mark
          a value as secret to keep it masked until you ask for it.
        </p>
      </div>

      {fields.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint">No custom fields yet.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <CustomFieldRow
              key={index}
              field={field}
              disabled={disabled}
              onChange={(patch) => replace(index, patch)}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}

      <Button size="sm" disabled={disabled} onClick={() => onChange([...fields, { label: "", value: "" }])}>
        <PlusIcon className="size-4" />
        Add field
      </Button>
    </div>
  );
}
