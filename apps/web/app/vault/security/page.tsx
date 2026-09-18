"use client";

import { AuditTrailPanel } from "@/components/app/security/AuditTrailPanel";
import { SessionsPanel } from "@/components/app/security/SessionsPanel";

export default function SecurityPage() {
  return (
    <div className="space-y-9">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">Security</h1>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-muted">
          Review every browser and device that can open this vault, then read
          back everything Ahaai has recorded for this account.
        </p>
      </header>

      <div className="space-y-6">
        <SessionsPanel />
        <AuditTrailPanel />
      </div>
    </div>
  );
}
