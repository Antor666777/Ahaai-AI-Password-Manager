"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PasswordField, TextInput } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { rewrapForNewEmail } from "@/lib/client/crypto";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { describeApiFailure, failureCopy } from "./apiFailure";

const FORM_ID = "ahaai-change-email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** Plain words for what happened to the other sessions. */
function revokedText(count: number): string {
  if (count === 0) {
    return "No other session was open, so this device is the only one signed in.";
  }
  if (count === 1) {
    return "One other session was signed out. This device stays signed in.";
  }
  return `${count} other sessions were signed out. This device stays signed in.`;
}

export interface ChangeEmailDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Changes the account address. The wrapped vault key is bound to the address,
 * so the master password has to be re-entered here: it re-wraps the same vault
 * key under the new address before the server stores it. Only the vault key is
 * in memory, never the master key.
 */
export function ChangeEmailDialog({ open, onClose }: ChangeEmailDialogProps) {
  const toast = useToast();
  const { user, vaultMaterial, vaultKey, verifyMasterPassword, refresh } =
    useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ email: string; revoked: number } | null>(
    null,
  );

  const emailShell = useRef<HTMLDivElement>(null);
  const passwordShell = useRef<HTMLDivElement>(null);

  function reset() {
    setEmail("");
    setPassword("");
    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(null);
    setOutcome(null);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!user || !vaultMaterial || !vaultKey) {
      setFormError(
        "This page lost the vault key for the session. Unlock the vault again, then change the email.",
      );
      return;
    }

    const trimmed = email.trim();
    let nextEmailError: string | undefined;
    let nextPasswordError: string | undefined;

    if (trimmed.length === 0) {
      nextEmailError = "Enter the new email address.";
    } else if (!EMAIL_PATTERN.test(trimmed)) {
      nextEmailError = "Enter a valid email address.";
    } else if (normalize(trimmed) === normalize(user.email)) {
      nextEmailError = "That is already this account's address.";
    }
    if (password.length === 0) {
      nextPasswordError = "Enter the master password for this account.";
    }

    if (nextEmailError || nextPasswordError) {
      setFormError(null);
      setEmailError(nextEmailError);
      setPasswordError(nextPasswordError);
      window.requestAnimationFrame(() => {
        if (nextEmailError) {
          emailShell.current?.querySelector<HTMLInputElement>("input")?.focus();
        } else {
          passwordShell.current?.querySelector<HTMLInputElement>("input")?.focus();
        }
      });
      return;
    }

    setEmailError(undefined);
    setPasswordError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      // A wrong password would otherwise seal the vault key under a key that
      // cannot be derived again, so the password is confirmed before the re-wrap.
      const confirmed = await verifyMasterPassword(password);
      if (!confirmed) {
        setPasswordError(
          "That master password did not match this account. Check it and try again.",
        );
        window.requestAnimationFrame(() =>
          passwordShell.current?.querySelector<HTMLInputElement>("input")?.focus(),
        );
        return;
      }

      const { protectedVaultKey } = await rewrapForNewEmail(
        vaultKey,
        password,
        trimmed,
        vaultMaterial.kdfParams,
      );
      const result = await api.changeEmail({
        email: trimmed,
        protectedVaultKey,
      });

      setOutcome({ email: result.user.email, revoked: result.revokedSessions });
      setEmail("");
      setPassword("");
      // The session still holds the envelope bound to the old address. Re-read
      // it so a later lock and unlock derive against the new binding.
      await refresh();
      toast.success("Email address changed", revokedText(result.revokedSessions));
    } catch (caught) {
      const failure = describeApiFailure(caught);
      if (failure.code === "CONFLICT") {
        setEmailError("An account with this email already exists.");
        window.requestAnimationFrame(() =>
          emailShell.current?.querySelector<HTMLInputElement>("input")?.focus(),
        );
      } else if (failure.code === "BAD_REQUEST") {
        setFormError(
          failure.serverMessage ??
            "The server could not read that request. Check the address, then try again.",
        );
      } else {
        setFormError(
          failureCopy(
            failure,
            "The email address was not changed. Reload the page, then try again.",
          ),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Change email address"
      description="The vault key is bound to this address, so Ahaai re-wraps it on this device with your master password. The master password is never sent."
      footer={
        outcome ? (
          <Button onClick={close}>Close</Button>
        ) : (
          <>
            <Button onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              variant="primary"
              loading={submitting}
            >
              Change email
            </Button>
          </>
        )
      }
    >
      {outcome ? (
        <Callout tone="accent" title="Email address changed">
          <p>
            This account now signs in as{" "}
            <span className="mono-data text-ink">{outcome.email}</span>.
          </p>
          <p className="mt-2">{revokedText(outcome.revoked)}</p>
          <p className="mt-2">
            Unlocking on this device is unchanged. Any other device has to sign
            in again with the master password.
          </p>
        </Callout>
      ) : (
        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="space-y-4">
          <div ref={emailShell}>
            <TextInput
              id="ahaai-new-email"
              name="email"
              type="email"
              label="New email address"
              value={email}
              autoComplete="email"
              disabled={submitting}
              error={emailError ?? null}
              hint="Ahaai stores the address in lower case."
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(undefined);
              }}
            />
          </div>

          <div ref={passwordShell}>
            <PasswordField
              id="ahaai-email-master-password"
              name="master-password"
              label="Master password"
              value={password}
              autoComplete="current-password"
              disabled={submitting}
              error={passwordError ?? null}
              hint="Needed to re-wrap the vault key under the new address."
              onChange={(value) => {
                setPassword(value);
                if (passwordError) setPasswordError(undefined);
              }}
            />
          </div>

          <p className="text-[12.5px] leading-relaxed text-ink-faint">
            Every other session is signed out. This device stays signed in, and
            your items stay sealed under the same vault key.
          </p>

          {submitting ? (
            <p
              role="status"
              className="flex items-center gap-2 text-[12.5px] text-ink-muted"
            >
              Re-wrapping the vault key in this browser. This takes a moment.
            </p>
          ) : null}

          {formError ? (
            <div role="alert">
              <Callout tone="danger" title="Email address was not changed">
                {formError}
              </Callout>
            </div>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
