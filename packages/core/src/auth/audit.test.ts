import { describe, expect, it } from "vitest";
import type { Database } from "@ahaai/db/types";
import { recordSecurityEvent } from "./audit";

describe("recordSecurityEvent", () => {
  it("never throws when the audit insert fails", async () => {
    const broken = {
      insert: () => {
        throw new Error("database is down");
      },
    } as unknown as Database;

    // Callers await this after the real write has committed, so a throw here
    // would report a failure for an operation that actually succeeded.
    await expect(
      recordSecurityEvent(broken, { type: "auth.logout" }),
    ).resolves.toBeUndefined();
  });
});
