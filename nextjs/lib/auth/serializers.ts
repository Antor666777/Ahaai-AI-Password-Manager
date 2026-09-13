import type { KdfParams, Session, User } from "@/lib/db/schema";
import type { SettingsView } from "@/lib/settings";

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  securityStamp: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    securityStamp: user.securityStamp,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export interface PublicSession {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export function toPublicSession(
  session: Session,
  currentSessionId?: string,
): PublicSession {
  return {
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  };
}

export interface VaultKeyMaterial {
  protectedVaultKey: string;
  kdfParams: KdfParams;
}

export function toSettingsView(settings: SettingsView) {
  return {
    aiMode: settings.aiMode,
    defaultProviderId: settings.defaultProviderId,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}
