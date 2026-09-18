import type { Database } from "@ahaai/db/types";
import { securityEvents } from "@ahaai/db/schema";
import { logger } from "@ahaai/core/log";

export type SecurityEventType =
  | "auth.register"
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.password.changed"
  | "auth.email.changed"
  | "auth.verify.failed"
  | "auth.account.deleted"
  | "session.revoked"
  | "session.revoked_all"
  | "session.reuse_detected"
  | "vault.item.created"
  | "vault.items.bulk_created"
  | "vault.items.bulk_updated"
  | "vault.item.updated"
  | "vault.item.deleted"
  | "vault.item.restored"
  | "vault.item.purged"
  | "vault.tag.created"
  | "vault.tag.updated"
  | "vault.tag.deleted"
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

/**
 * Writes an audit row. Auditing is never allowed to fail the operation it
 * records: callers await this after a write has already committed, so a throw
 * here would report a failure for work that actually succeeded.
 */
export async function recordSecurityEvent(
  db: Database,
  event: SecurityEventInput,
): Promise<void> {
  try {
    await db.insert(securityEvents).values({
      userId: event.userId ?? null,
      type: event.type,
      severity: event.severity ?? "info",
      ipAddress: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      metadata: event.metadata ?? null,
    });
  } catch (error) {
    logger.error("security event was not recorded", {
      type: event.type,
      userId: event.userId ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
