"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyButton, MonoValue } from "@/components/ui/data";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { ChangeEmailDialog } from "./ChangeEmailDialog";
import { ChangeMasterPasswordDialog } from "./ChangeMasterPasswordDialog";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import {
  ActionRow,
  SettingList,
  SettingRow,
  SettingsSection,
  formatDate,
  formatDateTime,
} from "./SettingsSection";
import { describeApiFailure, failureCopy } from "./apiFailure";

export function AccountSection() {
  const router = useRouter();
  const toast = useToast();
  const { user, lock, logout } = useSession();

  const [changing, setChanging] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [freshStamp, setFreshStamp] = useState<string | null>(null);

  if (!user) return null;

  const securityStamp = freshStamp ?? user.securityStamp;

  function lockVault() {
    // Drops the vault key from memory, then sends the user to unlock it again.
    lock();
    router.push("/unlock");
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } catch (caught) {
      const failure = describeApiFailure(caught);
      toast.error(
        "Sign out did not finish on the server",
        failureCopy(
          failure,
          "The browser dropped this session anyway. Reload the page if the vault opens by itself.",
        ),
      );
    } finally {
      router.push("/");
    }
  }

  return (
    <SettingsSection
      id="account"
      title="Account and access"
      consequence="Who this vault belongs to, then the three actions that re-seal it, close it, or end this session."
    >
      <div className="panel p-4 sm:p-5">
        <h3 className="text-[13px] font-semibold text-ink">This account</h3>
        <SettingList className="mt-2">
          <SettingRow label="Email">
            <span className="break-words">{user.email}</span>
          </SettingRow>
          <SettingRow label="Member since">
            <span className="nums">{formatDate(user.createdAt)}</span>
          </SettingRow>
          <SettingRow label="Last sign in">
            {user.lastLoginAt ? (
              <span className="nums">{formatDateTime(user.lastLoginAt)}</span>
            ) : (
              <span className="text-ink-muted">
                No sign in recorded yet. This device is the first.
              </span>
            )}
          </SettingRow>
          <SettingRow label="Security stamp">
            <div className="flex items-center gap-1">
              <MonoValue value={securityStamp} />
              <CopyButton
                value={securityStamp}
                label="Copy security stamp"
              />
            </div>
            {freshStamp ? (
              <p className="mt-1 text-[12.5px] text-ink-faint">
                Updated by the password change you just made.
              </p>
            ) : null}
          </SettingRow>
        </SettingList>
      </div>

      <div className="panel px-4 sm:px-5">
        <ActionRow
          title="Change email address"
          description="Moves this account to a new address. Ahaai re-wraps the vault key under the new address, and every other session is signed out. This device stays signed in."
          control={
            <Button onClick={() => setChangingEmail(true)}>Change email</Button>
          }
        />
        <ActionRow
          title="Change master password"
          description="Re-seals the vault under a new password. Every other session is signed out, and this device stays signed in."
          control={
            <Button onClick={() => setChanging(true)}>
              Change master password
            </Button>
          }
        />
        <ActionRow
          title="Lock vault"
          description="Drops the vault key from memory on this device. Nothing is signed out, and your items stay sealed until you unlock again."
          control={
            <Button variant="primary" onClick={lockVault}>
              Lock vault
            </Button>
          }
        />
        <ActionRow
          title="Sign out"
          description="Ends this session on this device. Your vault stays sealed on the server, ready for your next sign in."
          control={
            <Button loading={signingOut} onClick={() => void signOut()}>
              Sign out
            </Button>
          }
        />
      </div>

      {freshStamp ? (
        <p className="text-[12.5px] text-ink-faint">
          Other sessions were signed out by the change. This device stayed
          signed in.
        </p>
      ) : null}

      <div className="panel border-danger/40 p-4 sm:p-5">
        <h3 className="text-[13px] font-semibold text-danger">Danger zone</h3>
        <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-muted">
          Deleting the account removes the vault, its items, the providers and
          every session. There is no recovery key, so this cannot be undone.
        </p>
        <div className="mt-3">
          <Button variant="danger" onClick={() => setDeleting(true)}>
            Delete account
          </Button>
        </div>
      </div>

      <ChangeMasterPasswordDialog
        open={changing}
        onClose={() => setChanging(false)}
        onChanged={(result) => setFreshStamp(result.securityStamp)}
      />
      <ChangeEmailDialog
        open={changingEmail}
        onClose={() => setChangingEmail(false)}
      />
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </SettingsSection>
  );
}
