"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { useSession } from "@/lib/client/session";
import { SignOutIcon } from "./Icons";

/**
 * The account control at the foot of the rail. Locking drops the vault key;
 * signing out ends the session entirely. Both are named for what they do.
 */
export function SessionMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, lock, logout } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const email = user?.email ?? "this account";

  function close() {
    setOpen(false);
    onNavigate?.();
  }

  function handleLock() {
    setOpen(false);
    onNavigate?.();
    lock();
    router.replace("/unlock");
  }

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
    setOpen(false);
    router.replace("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 truncate rounded-md px-3 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <SignOutIcon className="size-4 shrink-0" />
        <span className="truncate" title={email}>
          {email}
        </span>
      </button>

      {open ? (
        <Dialog
          open
          onClose={close}
          title="Session"
          description={`Signed in as ${email}.`}
          footer={
            <>
              <Button onClick={handleSignOut} loading={signingOut}>
                Sign out
              </Button>
              <Button
                variant="primary"
                onClick={handleLock}
                disabled={signingOut}
              >
                Lock vault
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Locking clears the vault key from this tab. Ahaai never stored it, so
            unlocking asks for your master password again. Signing out ends the
            session on this device and returns you to the start page.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
