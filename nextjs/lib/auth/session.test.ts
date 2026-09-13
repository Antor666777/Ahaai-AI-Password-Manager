import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser } from "@/test/helpers/auth";
import { createTestDb, type TestDb } from "@/test/helpers/db";
import { sessions } from "@/lib/db/schema";
import {
  createSession,
  deleteExpiredSessions,
  hashSessionToken,
  listSessions,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from "./session";

describe("session service", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates a session that does not store the raw token", async () => {
    const user = await createTestUser(ctx.db, { email: "s1@example.com" });
    const { token, session } = await createSession(ctx.db, user.id, {
      ip: "203.0.113.7",
      userAgent: "vitest",
      deviceType: "web",
    });

    expect(session.tokenHash).toBe(hashSessionToken(token));
    expect(session.tokenHash).not.toBe(token);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(session.ipAddress).toBe("203.0.113.7");
  });

  it("resolves an active session and rejects unknown tokens", async () => {
    const user = await createTestUser(ctx.db, { email: "s2@example.com" });
    const { token } = await createSession(ctx.db, user.id);

    const active = await resolveSession(ctx.db, token);
    expect(active.status).toBe("active");
    if (active.status === "active") {
      expect(active.user.id).toBe(user.id);
    }

    expect((await resolveSession(ctx.db, "not-a-token")).status).toBe("none");
  });

  it("rejects revoked and expired sessions", async () => {
    const user = await createTestUser(ctx.db, { email: "s3@example.com" });

    const revoked = await createSession(ctx.db, user.id);
    await revokeSession(ctx.db, revoked.session.id);
    expect((await resolveSession(ctx.db, revoked.token)).status).toBe("none");

    const expired = await createSession(ctx.db, user.id);
    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, expired.session.id));
    expect((await resolveSession(ctx.db, expired.token)).status).toBe("none");
  });

  it("detects token reuse after rotation and revokes the session", async () => {
    const user = await createTestUser(ctx.db, { email: "s4@example.com" });
    const created = await createSession(ctx.db, user.id);

    const rotated = await rotateSession(ctx.db, created.session);
    expect(rotated.token).not.toBe(created.token);
    expect((await resolveSession(ctx.db, rotated.token)).status).toBe("active");

    const reuse = await resolveSession(ctx.db, created.token);
    expect(reuse.status).toBe("reuse");

    const [row] = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, created.session.id));
    expect(row.revokedAt).not.toBeNull();
  });

  it("lists active sessions and revokes all but the current one", async () => {
    const user = await createTestUser(ctx.db, { email: "s5@example.com" });
    // Registration already created a session; clear it for a precise count.
    await revokeAllSessions(ctx.db, user.id);

    const first = await createSession(ctx.db, user.id);
    const second = await createSession(ctx.db, user.id);
    const third = await createSession(ctx.db, user.id);

    expect(await listSessions(ctx.db, user.id)).toHaveLength(3);

    const revoked = await revokeAllSessions(ctx.db, user.id, second.session.id);
    expect(revoked).toBe(2);
    expect((await resolveSession(ctx.db, first.token)).status).toBe("none");
    expect((await resolveSession(ctx.db, third.token)).status).toBe("none");
    expect((await resolveSession(ctx.db, second.token)).status).toBe("active");
  });

  it("deletes only expired sessions", async () => {
    const user = await createTestUser(ctx.db, { email: "s6@example.com" });
    const active = await createSession(ctx.db, user.id);
    const expired = await createSession(ctx.db, user.id);
    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, expired.session.id));

    const deleted = await deleteExpiredSessions(ctx.db);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect((await resolveSession(ctx.db, active.token)).status).toBe("active");
  });
});
