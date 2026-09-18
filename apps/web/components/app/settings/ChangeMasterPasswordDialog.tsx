"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { StrengthMeter } from "@/components/ui/data";
import { Callout } from "@/components/ui/feedback";
import { PasswordField } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { deriveAuthHash, rewrapForNewPassword } from "@/lib/client/crypto";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { evaluateMasterPassword } from "@ahaai/core/crypto/password-policy";
import { describeApiFailure, failureCopy } from "./apiFailure";

const FORM_ID = "ahaai-change-password";

interface FieldErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

export interface ChangeResult {
  securityStamp: string;
  revokedSessions: number;
}

export interface ChangeMasterPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onChanged: (result: ChangeResult) => void;
}

/** Plain words for what happened to the other sessions. */
function revokedText(count: number): string {
  if (count === 0) {
    return "No other session was open, so this device is the only one holding the new password.";
  }
  if (count === 1) {
    return "One other session was signed out. This device stays signed in.";
  }
  return `${count} other sessions were signed out. This device stays signed in.`;
}

export function ChangeMasterPasswordDialog({
  open,
  onClose,
  onChanged,
}: ChangeMasterPasswordDialogProps) {
  const toast = useToast();
  const { user, vaultMaterial, vaultKey, refresh } = useSession();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentError, setCurrentError] = useState<string | undefined>();
  const [nextError, setNextError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ChangeResult | null>(null);

  const currentShell = useRef<HTMLDivElement>(null);
  const nextShell = useRef<HTMLDivElement>(null);
  const confirmShell = useRef<HTMLDivElement>(null);

  const strength = evaluateMasterPassword(next, { email: user?.email ?? "" });

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setCurrentError(undefined);
    setNextError(undefined);
    setConfirmError(undefined);
    setFormError(null);
    setOutcome(null);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  function focusFirstInvalid(errors: FieldErrors) {
    if (errors.current) {
      currentShell.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else if (errors.next) {
      nextShell.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else if (errors.confirm) {
      confirmShell.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!user || !vaultMaterial || !vaultKey) {
      setFormError(
        "This page lost the vault key for the session. Unlock the vault again, then change the password.",
      );
      return;
    }

    const errors: FieldErrors = {};
    const firstIssue =
      strength.issues.at(0) ?? "Use a stronger master password";
    if (current.length === 0) {
      errors.current = "Enter the master password you use now.";
    }
    if (!strength.ok) {
      errors.next = `${firstIssue}.`;
    } else if (next === current) {
      errors.next =
        "The new password matches the current one. Use a different master password.";
    }
    if (confirm !== next) {
      errors.confirm = "The two entries do not match. Type the new master password again.";
    }

    if (errors.current || errors.next || errors.confirm) {
      setFormError(null);
      setCurrentError(errors.current);
      setNextError(errors.next);
      setConfirmError(errors.confirm);
      focusFirstInvalid(errors);
      return;
    }

    setCurrentError(undefined);
    setNextError(undefined);
    setConfirmError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      // The auth hash proves the current password. The new material re-wraps the
      // SAME vault key under the new password, so existing items stay readable.
      const currentAuthHash = await deriveAuthHash(
        current,
        vaultMaterial.kdfParams,
      );
      const material = await rewrapForNewPassword(vaultKey, next, user.email);
      const result = await api.changePassword({
        currentAuthHash,
        authHash: material.authHash,
        kdfParams: material.kdfParams,
        protectedVaultKey: material.protectedVaultKey,
      });

      const outcomeValue: ChangeResult = {
        securityStamp: result.securityStamp,
        revokedSessions: result.revokedSessions,
      };
      setOutcome(outcomeValue);
      setCurrent("");
      setNext("");
      setConfirm("");
      onChanged(outcomeValue);
      // The session still holds the old wrapped vault key. Re-read it, otherwise
      // a later lock and unlock would derive against the previous envelope.
      await refresh();
      toast.success(
        "Master password changed",
        revokedText(result.revokedSessions),
      );
    } catch (caught) {
      const failure = describeApiFailure(caught);
      if (failure.code === "FORBIDDEN") {
        setCurrentError(
          "The current master password did not match this account. Check it and try again.",
        );
        window.requestAnimationFrame(() =>
          currentShell.current?.querySelector<HTMLInputElement>("input")?.focus(),
        );
      } else if (failure.code === "BAD_REQUEST") {
        setFormError(
          failure.serverMessage ??
            "The server could not read that request. Check the new password, then try again.",
        );
      } else {
        setFormError(
          failureCopy(
            failure,
            "The master password was not changed. Reload the page, then try again.",
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
      title="Change master password"
      description="Ahaai re-wraps your vault key under the new password on this device. Your items stay sealed under the same key, and neither password is ever sent."
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
              Change master password
            </Button>
          </>
        )
      }
    >
      {outcome ? (
        <Callout tone="accent" title="Master password changed">
          <p>{revokedText(outcome.revokedSessions)}</p>
          <p className="mt-2">
            Use the new master password anywhere you sign in from now on.
          </p>
          <p className="mt-2">
            Security stamp now reads{" "}
            <span className="mono-data text-ink">{outcome.securityStamp}</span>.
          </p>
        </Callout>
      ) : (
        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="space-y-4">
          <div ref={currentShell}>
            <PasswordField
              id="ahaai-current-master-password"
              name="current-master-password"
              label="Current master password"
              value={current}
              autoComplete="current-password"
              disabled={submitting}
              error={currentError ?? null}
              hint="Ahaai checks this against the vault key on this device."
              onChange={(value) => {
                setCurrent(value);
                if (currentError) setCurrentError(undefined);
              }}
            />
          </div>

          <div ref={nextShell} className="space-y-3">
            <PasswordField
              id="ahaai-new-master-password"
              name="new-master-password"
              label="New master password"
              value={next}
              autoComplete="new-password"
              disabled={submitting}
              error={nextError ?? null}
              hint="Twelve characters or more. A few words in a row beat a short scramble."
              onChange={(value) => {
                setNext(value);
                if (nextError) setNextError(undefined);
              }}
            />
            {next.length > 0 ? (
              <div className="space-y-2">
                <StrengthMeter score={strength.score} />
                {strength.issues.length > 0 && !nextError ? (
                  <ul className="space-y-0.5">
                    {strength.issues.map((issue) => (
                      <li key={issue} className="text-[12.5px] text-ink-faint">
                        {issue}.
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div ref={confirmShell}>
            <PasswordField
              id="ahaai-confirm-master-password"
              name="confirm-master-password"
              label="Repeat new master password"
              value={confirm}
              autoComplete="new-password"
              disabled={submitting}
              error={confirmError ?? null}
              hint="Two entries, so a typo cannot lock you out."
              onChange={(value) => {
                setConfirm(value);
                if (confirmError) setConfirmError(undefined);
              }}
            />
          </div>

          <p className="text-[12.5px] leading-relaxed text-ink-faint">
            There is no recovery key. A change signs every other session out and
            keeps this device signed in.
          </p>

          {submitting ? (
            <p
              role="status"
              className="flex items-center gap-2 text-[12.5px] text-ink-muted"
            >
              Deriving the new keys in this browser. This takes a moment.
            </p>
          ) : null}

          {formError ? (
            <div role="alert">
              <Callout tone="danger" title="Master password was not changed">
                {formError}
              </Callout>
            </div>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
