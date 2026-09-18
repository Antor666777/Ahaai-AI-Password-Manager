"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PasswordField } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { useSession } from "@/lib/client/session";

export interface RepromptDialogProps {
  open: boolean;
  onClose: () => void;
  /** The master password checked out. The caller decides what to reveal. */
  onVerified: () => void;
}

/**
 * Asks for the master password before a reprompt item's secret is revealed.
 * Verification derives the auth hash in the browser and records a short grace
 * window on the session, so a wrong password stays open with an inline message
 * while a right one closes and lets the caller reveal.
 */
export function RepromptDialog({
  open,
  onClose,
  onVerified,
}: RepromptDialogProps) {
  const session = useSession();
  const formId = useId();
  const shell = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function focusPassword() {
    shell.current?.querySelector<HTMLInputElement>("input")?.focus();
  }

  function requestClose() {
    if (busy) return;
    setPassword("");
    setPasswordError(null);
    setFailure(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setPasswordError(null);
    setFailure(null);

    if (password.length === 0) {
      setPasswordError("Enter your master password to continue.");
      focusPassword();
      return;
    }

    setBusy(true);
    try {
      const ok = await session.verifyMasterPassword(password);
      if (ok) {
        setPassword("");
        onVerified();
      } else {
        setPasswordError("That master password did not match. Try again.");
        focusPassword();
      }
    } catch (caught) {
      setFailure(
        caught instanceof Error && caught.message.length > 0
          ? caught.message
          : "Ahaai could not check the master password. Check your connection, then try again.",
      );
      focusPassword();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title="Enter your master password"
      description="Ahaai asks for it again before it shows this secret. It checks the password here and does not store it."
      footer={
        <>
          <Button onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            Confirm password
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-3">
        <div ref={shell}>
          <PasswordField
            label="Master password"
            autoComplete="current-password"
            autoFocus
            value={password}
            disabled={busy}
            error={passwordError}
            onChange={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(null);
            }}
          />
        </div>

        {failure ? (
          <div role="alert">
            <Callout tone="danger" title="Master password not checked">
              {failure}
            </Callout>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
