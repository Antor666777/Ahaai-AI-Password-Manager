"use client";

/* eslint-disable react-hooks/set-state-in-effect --
   The session is loaded from the API on mount. Every setState in these effects
   lands after the awaited request resolves, which is the intended pattern for
   client-side data loading; it is not a synchronous cascading render. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import { deriveAuthHash, deriveRegistration, unlockVault } from "./crypto";
import type { ApiSettings, ApiUser, ApiVaultKey } from "./types";

/**
 * `error` means the lookup failed for a reason other than "not signed in" (a
 * network drop or a 5xx). It is deliberately distinct from `anonymous`: a
 * transient failure must not throw a signed in user back to the sign in form.
 */
export type SessionStatus = "loading" | "anonymous" | "authenticated" | "error";

/** How long the vault may sit idle before the key leaves memory. */
const AUTO_LOCK_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

interface SessionValue {
  status: SessionStatus;
  /** Set when `status` is `error`, so the retry screen can say what failed. */
  error: string | null;
  user: ApiUser | null;
  settings: ApiSettings | null;
  /** Wrapped vault key and KDF params. Held so a reload can unlock again. */
  vaultMaterial: ApiVaultKey | null;
  /** The unwrapped vault key. Memory only, gone on reload. */
  vaultKey: Uint8Array | null;
  locked: boolean;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setSettings: (settings: ApiSettings) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [vaultMaterial, setVaultMaterial] = useState<ApiVaultKey | null>(null);
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await api.session();
      setUser(result.user);
      setSettings(result.settings);
      setVaultMaterial(result.vault);
      setError(null);
      setStatus("authenticated");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        // The server answered: this browser is not signed in.
        setUser(null);
        setSettings(null);
        setVaultMaterial(null);
        setVaultKey(null);
        setError(null);
        setStatus("anonymous");
        return;
      }
      // A network drop or a server fault is not a sign out. Keep an existing
      // session and its key untouched, and only surface a retry when there is
      // nothing working to fall back to.
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reach the server.",
      );
      setStatus((current) => (current === "authenticated" ? current : "error"));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(async (email: string, password: string) => {
    const material = await deriveRegistration(password, email);
    const result = await api.register({
      email,
      authHash: material.authHash,
      kdfParams: material.kdfParams,
      protectedVaultKey: material.protectedVaultKey,
    });
    setUser(result.user);
    setVaultMaterial(result.vault);
    // Registration already produced the vault key, so the vault opens unlocked.
    setVaultKey(material.vaultKey);
    setError(null);
    setStatus("authenticated");
    const session = await api.session();
    setSettings(session.settings);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { kdfParams } = await api.prelogin(email);
    const authHash = await deriveAuthHash(password, kdfParams);
    const result = await api.login({ email, authHash });
    setUser(result.user);
    setVaultMaterial(result.vault);
    setVaultKey(null);
    setError(null);
    setStatus("authenticated");
    const session = await api.session();
    setSettings(session.settings);
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      if (!user || !vaultMaterial) {
        throw new Error("Sign in again before unlocking the vault.");
      }
      const unlocked = await unlockVault(
        password,
        vaultMaterial.kdfParams,
        vaultMaterial.protectedVaultKey,
        user.email,
      );
      setVaultKey(unlocked.vaultKey);
    },
    [user, vaultMaterial],
  );

  const lock = useCallback(() => {
    setVaultKey((current) => {
      // Overwrite the key bytes before dropping the reference so the material
      // does not linger in the heap until a collection happens to run.
      current?.fill(0);
      return null;
    });
  }, []);

  // Locking is nothing to do with the session: the cookie stays valid and the
  // vault just needs the master password again.
  useEffect(() => {
    if (status !== "authenticated" || vaultKey === null) return;

    let timer = window.setTimeout(lock, AUTO_LOCK_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, AUTO_LOCK_MS);
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [status, vaultKey, lock]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Best effort. A failed revoke must not strand the user on a spinner:
      // the local key and session are dropped either way.
    }
    setUser(null);
    setSettings(null);
    setVaultMaterial(null);
    setVaultKey(null);
    setError(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      error,
      user,
      settings,
      vaultMaterial,
      vaultKey,
      locked: status === "authenticated" && vaultKey === null,
      register,
      login,
      unlock,
      lock,
      logout,
      refresh,
      setSettings,
    }),
    [
      status,
      error,
      user,
      settings,
      vaultMaterial,
      vaultKey,
      register,
      login,
      unlock,
      lock,
      logout,
      refresh,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
