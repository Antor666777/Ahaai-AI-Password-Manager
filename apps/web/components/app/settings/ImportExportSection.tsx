"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/data";
import { Badge, Callout, InlineError } from "@/components/ui/feedback";
import { PasswordField } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { useVault } from "@/lib/client/vault";
import {
  CSV_MIME,
  JSON_MIME,
  buildCsvExport,
  buildEncryptedExport,
  commitImport,
  downloadFile,
  exportFileName,
  isEncryptedExportFile,
  prepareEncryptedImport,
  prepareImport,
  type CsvExportKind,
  type ImportPreflight,
} from "@/lib/client/transfer";
import type { TransferItemType } from "@ahaai/core/transfer";
import { SettingsSection } from "./SettingsSection";
import { describeApiFailure, failureCopy } from "./apiFailure";

const TYPE_LABEL: Record<TransferItemType, string> = {
  login: "logins",
  card: "cards",
  identity: "identities",
  secure_note: "secure notes",
};

const FORMAT_LABEL: Record<string, string> = {
  bitwarden: "Bitwarden",
  lastpass: "LastPass",
  onepassword: "1Password",
  keepass: "KeePass",
  generic: "generic",
  "ahaai-json": "Ahaai encrypted",
};

const CSV_KIND_LABEL: Record<CsvExportKind, string> = {
  generic: "Ahaai generic CSV",
  bitwarden: "Bitwarden CSV",
};

/** Shows skipped rows in the pre-flight without turning the panel into a table. */
const SKIPPED_PREVIEW_LIMIT = 20;

export function ImportExportSection() {
  const toast = useToast();
  const { vaultKey } = useSession();
  const { items, folders, createFolder, reload } = useVault();

  const fileInput = useRef<HTMLInputElement>(null);
  const [preflight, setPreflight] = useState<ImportPreflight | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** Set when the chosen file is one of our own encrypted exports. */
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);

  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [csvKind, setCsvKind] = useState<CsvExportKind | null>(null);

  const locked = vaultKey === null;

  function resetImport() {
    setPreflight(null);
    setProgress(null);
    setEncryptedFile(null);
    setImportPassphrase("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setImportError(null);
    setPreflight(null);
    setProgress(null);

    // Our own export is encrypted, so it needs a passphrase before it can be
    // read. A CSV is parsed straight away.
    if (isEncryptedExportFile(file)) {
      setEncryptedFile(file);
      setImportPassphrase("");
      return;
    }

    setEncryptedFile(null);
    setPreparing(true);
    try {
      // Parse only. Nothing is sealed or sent until the user confirms.
      setPreflight(await prepareImport(file));
    } catch (caught) {
      setImportError(
        caught instanceof Error
          ? caught.message
          : "That file could not be read as a CSV export.",
      );
    } finally {
      setPreparing(false);
    }
  }

  async function decryptExport() {
    if (!encryptedFile || preparing) return;
    setImportError(null);
    setPreparing(true);
    try {
      setPreflight(await prepareEncryptedImport(encryptedFile, importPassphrase));
      setEncryptedFile(null);
      setImportPassphrase("");
    } catch (caught) {
      setImportError(
        caught instanceof Error
          ? caught.message
          : "That export could not be decrypted.",
      );
    } finally {
      setPreparing(false);
    }
  }

  async function runImport() {
    if (!preflight || !vaultKey) return;
    setImporting(true);
    setImportError(null);
    setProgress({ done: 0, total: preflight.total });
    try {
      const result = await commitImport(preflight, {
        vaultKey,
        folders,
        createFolder,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      await reload();
      toast.success(
        `Imported ${result.imported} item${result.imported === 1 ? "" : "s"}`,
        [
          result.skipped > 0
            ? `${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped.`
            : null,
          result.foldersCreated > 0
            ? `${result.foldersCreated} folder${result.foldersCreated === 1 ? "" : "s"} created.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      );
      resetImport();
    } catch (caught) {
      const failure = describeApiFailure(caught);
      setImportError(
        failureCopy(
          failure,
          caught instanceof Error
            ? caught.message
            : "The import did not finish. Try again.",
        ),
      );
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  async function exportJson() {
    if (passphrase.length < 8) {
      setExportError("Use a passphrase of at least 8 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setExportError("The two passphrases do not match.");
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const json = await buildEncryptedExport(items, folders, passphrase);
      downloadFile(exportFileName("json"), json, JSON_MIME);
      setPassphrase("");
      setConfirmPassphrase("");
      toast.success(
        "Encrypted export downloaded",
        `${items.length} item${items.length === 1 ? "" : "s"} sealed under your passphrase.`,
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error
          ? caught.message
          : "The encrypted export could not be built.",
      );
    } finally {
      setExporting(false);
    }
  }

  function runCsvExport() {
    if (!csvKind) return;
    const content = buildCsvExport(items, folders, csvKind);
    downloadFile(exportFileName("csv"), content, CSV_MIME);
    toast.success(
      "Plaintext CSV downloaded",
      "This file is not encrypted. Keep it somewhere safe, then delete it.",
    );
    setCsvKind(null);
  }

  return (
    <SettingsSection
      id="import-export"
      title="Import and export"
      consequence="Bring items in from another password manager, or take the whole vault out again. Every import is sealed in this browser before it is uploaded."
    >
      {/* Import */}
      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <h3 className="text-[13px] font-semibold text-ink">
            Import from another manager
          </h3>
          <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-ink-muted">
            Reads a CSV export from Bitwarden, LastPass, 1Password, or KeePass,
            or an Ahaai encrypted JSON export. A CSV is detected from its header.
            Nothing is uploaded until you confirm the summary below.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="import-file"
            className="block text-[13px] font-medium text-ink"
          >
            Choose an export file
          </label>
          <input
            id="import-file"
            ref={fileInput}
            type="file"
            accept=".csv,.json,text/csv,text/plain,application/json"
            disabled={locked || preparing || importing}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
            className="block w-full text-[13px] text-ink-muted file:me-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:bg-surface-2 disabled:opacity-55"
          />
        </div>

        {encryptedFile ? (
          <Callout tone="neutral" title="This is an Ahaai encrypted export">
            <p>
              Enter the passphrase you chose when it was exported. It is
              independent of your master password, and it is only used in this
              browser.
            </p>
            <div className="mt-3 space-y-3">
              <PasswordField
                label="Export passphrase"
                autoComplete="off"
                value={importPassphrase}
                onChange={(value) => {
                  setImportPassphrase(value);
                  setImportError(null);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={preparing}
                  disabled={importPassphrase.length === 0}
                  onClick={() => void decryptExport()}
                >
                  Decrypt export
                </Button>
                <Button onClick={resetImport} disabled={preparing}>
                  Cancel
                </Button>
              </div>
            </div>
          </Callout>
        ) : null}

        {preparing && !encryptedFile ? (
          <p role="status" className="text-[12.5px] text-ink-faint">
            Reading the file…
          </p>
        ) : null}

        {importError ? <InlineError>{importError}</InlineError> : null}

        {preflight ? (
          <Callout
            tone={preflight.total === 0 ? "warning" : "accent"}
            title={
              preflight.total === 0
                ? "Nothing to import"
                : `Ready to import ${preflight.total} item${
                    preflight.total === 1 ? "" : "s"
                  }`
            }
          >
            <p>
              {preflight.fileName} looks like a{" "}
              <span className="text-ink">
                {FORMAT_LABEL[preflight.format]}
              </span>{" "}
              export.
            </p>

            {preflight.total > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(preflight.byType) as TransferItemType[])
                  .filter((type) => preflight.byType[type] > 0)
                  .map((type) => (
                    <Badge key={type} tone="neutral">
                      {preflight.byType[type]} {TYPE_LABEL[type]}
                    </Badge>
                  ))}
              </div>
            ) : null}

            {preflight.folders.length > 0 ? (
              <p className="mt-2">
                Folders found:{" "}
                <span className="text-ink">
                  {preflight.folders.join(", ")}
                </span>
                . Missing folders are created; existing names are reused.
              </p>
            ) : null}

            {preflight.skipped.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink">
                  {preflight.skipped.length} row
                  {preflight.skipped.length === 1 ? "" : "s"} will be skipped
                </summary>
                <ul className="mt-1.5 space-y-0.5">
                  {preflight.skipped
                    .slice(0, SKIPPED_PREVIEW_LIMIT)
                    .map((row) => (
                      <li key={row.line}>
                        Row {row.line}: {row.reason}
                      </li>
                    ))}
                </ul>
                {preflight.skipped.length > SKIPPED_PREVIEW_LIMIT ? (
                  <p className="mt-1">
                    …and {preflight.skipped.length - SKIPPED_PREVIEW_LIMIT} more.
                  </p>
                ) : null}
              </details>
            ) : null}

            {progress ? (
              <p role="status" className="mt-2 nums">
                Importing {progress.done} of {progress.total}…
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                loading={importing}
                disabled={locked || preflight.total === 0}
                onClick={() => void runImport()}
              >
                Import {preflight.total} item
                {preflight.total === 1 ? "" : "s"}
              </Button>
              <Button onClick={resetImport} disabled={importing}>
                Cancel
              </Button>
            </div>
          </Callout>
        ) : null}
      </Panel>

      {/* Export */}
      <Panel className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <h3 className="text-[13px] font-semibold text-ink">
            Export your vault
          </h3>
          <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-ink-muted">
            {items.length} item{items.length === 1 ? "" : "s"} are ready to
            export. The JSON export is encrypted under a passphrase you choose;
            the CSV export is readable by anyone who opens the file.
          </p>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <h4 className="text-[13px] font-medium text-ink">
            Encrypted JSON (recommended)
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <PasswordField
              label="Export passphrase"
              hint="Independent of your master password."
              autoComplete="new-password"
              value={passphrase}
              onChange={(value) => {
                setPassphrase(value);
                setExportError(null);
              }}
            />
            <PasswordField
              label="Confirm passphrase"
              autoComplete="new-password"
              value={confirmPassphrase}
              onChange={(value) => {
                setConfirmPassphrase(value);
                setExportError(null);
              }}
            />
          </div>
          {exportError ? <InlineError>{exportError}</InlineError> : null}
          <Button
            variant="primary"
            loading={exporting}
            disabled={locked || items.length === 0}
            onClick={() => void exportJson()}
          >
            Download encrypted JSON
          </Button>
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <h4 className="text-[13px] font-medium text-ink">Plaintext CSV</h4>
          <Callout tone="warning" title="CSV exports are not encrypted">
            Any password or card number in a CSV is readable in a text editor.
            Use it only to move into another password manager, then delete the
            file.
          </Callout>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={locked || items.length === 0}
              onClick={() => setCsvKind("bitwarden")}
            >
              Download Bitwarden CSV
            </Button>
            <Button
              disabled={locked || items.length === 0}
              onClick={() => setCsvKind("generic")}
            >
              Download generic CSV
            </Button>
          </div>
        </div>
      </Panel>

      {locked ? (
        <Callout tone="neutral" title="Unlock to import or export">
          Your vault key is not in this browser right now, so items cannot be
          sealed or read. Unlock the vault, then come back.
        </Callout>
      ) : null}

      <ConfirmDialog
        open={csvKind !== null}
        onClose={() => setCsvKind(null)}
        onConfirm={runCsvExport}
        title="Download an unencrypted CSV?"
        description={
          csvKind
            ? `${CSV_KIND_LABEL[csvKind]} writes every password, note and card in plain text. Anyone who opens the file can read them.`
            : ""
        }
        confirmLabel="Download unencrypted CSV"
        cancelLabel="Cancel"
        tone="danger"
      />
    </SettingsSection>
  );
}
