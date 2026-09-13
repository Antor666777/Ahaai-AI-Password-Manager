"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { MonoValue } from "@/components/ui/data";
import { Skeleton } from "@/components/ui/feedback";
import { PasswordField } from "@/components/ui/field";
import { useSession } from "@/lib/client/session";

/**
 * The vault key is memory only, so a reload lands here. The password is derived
 * in the tab and never sent: a wrong one fails the key's own integrity check.
 */
export default function UnlockPage() {
  const { status, locked, user, unlock, logout } = useSession();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const passwordShell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "anonymous") router.replace("/");
    else if (status === "authenticated" && !locked) router.replace("/vault");
  }, [status, locked, router]);

  function focusPassword() {
    passwordShell.current?.querySelector("input")?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (password.length === 0) {
      setError("That master password did not unlock your vault");
      focusPassword();
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await unlock(password);
      router.replace("/vault");
    } catch {
      setError("That master password did not unlock your vault");
      setPassword("");
      focusPassword();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
    router.replace("/");
  }

  // While the session is looked up, or while a redirect is in flight, the form
  // would only be a flash of the wrong thing.
  if (status !== "authenticated" || !locked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-9">
        <div role="status" className="w-full max-w-sm space-y-3">
          <span className="sr-only">Checking this browser and getting ready</span>
          <Skeleton className="mx-auto h-5 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-9">
      <div className="w-full max-w-sm space-y-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <Wordmark className="text-[19px]" />
          <h1 className="text-[17px] font-semibold text-ink">
            Unlock your vault
          </h1>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            This session is still signed in, but the key that opens your vault is
            gone. Enter the master password to derive it again.
          </p>
        </header>

        <form onSubmit={handleSubmit} noValidate className="panel space-y-6 p-5">
          <div className="min-w-0 border-b border-line pb-3">
            <p className="text-[12.5px] text-ink-faint">Signed in as</p>
            <MonoValue value={user?.email ?? ""} className="mt-0.5" />
          </div>

          <div ref={passwordShell} className="space-y-2">
            <PasswordField
              label="Master password"
              name="master-password"
              value={password}
              autoComplete="current-password"
              autoFocus
              disabled={submitting || signingOut}
              error={error}
              hint="Ahaai derives the key here in this tab. Nothing about this password is sent."
              onChange={(value) => {
                setPassword(value);
                if (error) setError(null);
              }}
            />
            {error ? (
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                Check it and try again, or sign out below and start over.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={submitting}
              disabled={signingOut}
            >
              Unlock vault
            </Button>
            <p className="text-[12.5px] leading-relaxed text-ink-faint">
              The unlocked key lives only in this tab, in memory. Reloading or
              closing the tab locks the vault again, and Ahaai cannot recover a
              lost master password for you.
            </p>
          </div>

          <div className="border-t border-line pt-3">
            <Button
              className="w-full"
              onClick={handleSignOut}
              loading={signingOut}
              disabled={submitting}
            >
              Sign out
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
