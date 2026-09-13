import type { Database } from "@/lib/db/types";
import { securityEvents } from "@/lib/db/schema";

export type SecurityEventType =
  | "auth.register"
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.password.changed"
  | "session.revoked"
  | "session.reuse_detected"
  | "vault.item.created"
  | "vault.item.updated"
  | "vault.item.deleted"
  | "vault.item.restored"
  | "vault.item.purged"
  | "ai.provider.created"
  | "ai.provider.updated"
  | "ai.provider.deleted"
  | "ai.search.performed"
  | "pwned.range.checked";

export type SecurityEventSeverity = "info" | "warning" | "critical";

export interface SecurityEventInput {
  userId?: string | null;
  type: SecurityEventType;
  severity?: SecurityEventSeverity;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordSecurityEvent(
  db: Database,
  event: SecurityEventInput,
): Promise<void> {
  await db.insert(securityEvents).values({
    userId: event.userId ?? null,
    type: event.type,
    severity: event.severity ?? "info",
    ipAddress: event.ip ?? null,
    userAgent: event.userAgent ?? null,
    metadata: event.metadata ?? null,
  });
}
