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
import { api } from "./api";
import { deriveAuthHash, deriveRegistration, unlockVault } from "./crypto";
import type { ApiSettings, ApiUser, ApiVaultKey } from "./types";

export type SessionStatus = "loading" | "anonymous" | "authenticated";

interface SessionValue {
  status: SessionStatus;
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
      setStatus("authenticated");
    } catch {
      setUser(null);
      setSettings(null);
      setVaultMaterial(null);
      setVaultKey(null);
      setStatus("anonymous");
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

  const lock = useCallback(() => setVaultKey(null), []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setSettings(null);
      setVaultMaterial(null);
      setVaultKey(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
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
