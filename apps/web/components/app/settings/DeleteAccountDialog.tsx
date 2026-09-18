"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PasswordField, TextInput } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { deriveAuthHash } from "@/lib/client/crypto";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { describeApiFailure, failureCopy } from "./apiFailure";

const FORM_ID = "ahaai-delete-account";

export interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Deletes the account. The address has to be typed and the master password
 * entered, because the action is irreversible: with a zero-knowledge vault
 * there is nothing to restore and no other copy of the key.
 */
export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  const toast = useToast();
  const router = useRouter();
  const { user, vaultMaterial, logout } = useSession();

  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailShell = useRef<HTMLDivElement>(null);
  const passwordShell = useRef<HTMLDivElement>(null);

  const accountEmail = user?.email ?? "";
  const emailMatches =
    accountEmail.length > 0 &&
    typedEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase();
  const canDelete = emailMatches && password.length > 0 && !submitting;

  function reset() {
    setTypedEmail("");
    setPassword("");
    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(null);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDelete) return;
    if (!user || !vaultMaterial) {
      setFormError(
        "This page lost the session for this account. Sign in again, then delete the account.",
      );
      return;
    }

    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      // The server re-checks this hash against the stored one before it deletes
      // anything, so a wrong password changes nothing.
      const authHash = await deriveAuthHash(password, vaultMaterial.kdfParams);
      await api.deleteAccount(authHash);

      toast.success(
        "Account deleted",
        "Your vault, sessions and settings are gone. You are signed out.",
      );
      // Drop the in-memory key and session, then leave the app. The server has
      // already cleared the session cookie.
      await logout();
      router.replace("/");
    } catch (caught) {
      const failure = describeApiFailure(caught);
      if (failure.code === "UNAUTHORIZED") {
        setPasswordError(
          "That master password did not match this account. Check it and try again.",
        );
        window.requestAnimationFrame(() =>
          passwordShell.current?.querySelector<HTMLInputElement>("input")?.focus(),
        );
      } else {
        setFormError(
          failureCopy(
            failure,
            "The account was not deleted. Reload the page, then try again.",
          ),
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Delete account"
      description="This removes the account, its vault, its providers and every session. It cannot be undone."
      footer={
        <>
          <Button onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="danger"
            disabled={!canDelete}
            loading={submitting}
          >
            Delete account
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="space-y-4">
        <Callout tone="danger" title="This cannot be undone">
          Ahaai cannot read your vault, so it cannot restore it. Deleting the
          account destroys the wrapped vault key and every item. There is no
          recovery key and no backup on the server.
        </Callout>

        <div ref={emailShell}>
          <TextInput
            id="ahaai-delete-email"
            name="email"
            type="email"
            label={`Type ${accountEmail} to confirm`}
            value={typedEmail}
            autoComplete="off"
            disabled={submitting}
            error={emailError ?? null}
            hint="The full address, exactly as it appears above."
            onChange={(event) => {
              setTypedEmail(event.target.value);
              if (emailError) setEmailError(undefined);
            }}
          />
        </div>

        <div ref={passwordShell}>
          <PasswordField
            id="ahaai-delete-master-password"
            name="master-password"
            label="Master password"
            value={password}
            autoComplete="current-password"
            disabled={submitting}
            error={passwordError ?? null}
            hint="Ahaai checks this before anything is removed."
            onChange={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(undefined);
            }}
          />
        </div>

        {formError ? (
          <div role="alert">
            <Callout tone="danger" title="Account was not deleted">
              {formError}
            </Callout>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
