import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRegistrationMaterial, rewrapVaultKey } from "@ahaai/core/crypto/vault-key";
import { securityEvents, userSettings, users } from "@ahaai/db/schema";
import { createTestUser, deriveAuthHash, TEST_PASSWORD } from "@ahaai/testing/helpers/auth";
import { cheapKdfParams } from "@ahaai/testing/helpers/crypto";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import {
  changeMasterPassword,
  loginUser,
  logoutUser,
  normalizeEmail,
  registerUser,
} from "./service";
import { createSession, resolveSession, revokeAllSessions } from "./session";

describe("auth service", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("registers a user, stores a peppered hash, creates settings and a session", async () => {
    const email = "register@example.com";
    const kdfParams = cheapKdfParams();
    const authHash = await deriveAuthHash(TEST_PASSWORD, kdfParams);
    const material = await buildRegistrationMaterial(
      TEST_PASSWORD,
      kdfParams,
      normalizeEmail(email),
    );

    const result = await registerUser(ctx.db, {
      email,
      authHash,
      kdfParams,
      protectedVaultKey: material.protectedVaultKey,
    });

    expect(result.user.email).toBe(email);
    expect(result.user.authHash).not.toBe(authHash);
    expect(result.user.authHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.user.securityStamp).toMatch(/^[0-9a-f]{32}$/);
    expect(result.token.length).toBeGreaterThan(20);

    const [settings] = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, result.user.id));
    expect(settings.aiMode).toBe("cloud");

    const events = await ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, result.user.id));
    expect(events.map((event) => event.type)).toContain("auth.register");
  });

  it("rejects duplicate emails regardless of case", async () => {
    const kdfParams = cheapKdfParams();
    const authHash = await deriveAuthHash(TEST_PASSWORD, kdfParams);
    const material = await buildRegistrationMaterial(
      TEST_PASSWORD,
      kdfParams,
      "dupe@example.com",
    );

    await registerUser(ctx.db, {
      email: "Dupe@Example.com",
      authHash,
      kdfParams,
      protectedVaultKey: material.protectedVaultKey,
    });

    await expect(
      registerUser(ctx.db, {
        email: "dupe@example.com",
        authHash,
        kdfParams,
        protectedVaultKey: material.protectedVaultKey,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("answers a concurrent duplicate sign up with a conflict, never a raw failure", async () => {
    const kdfParams = cheapKdfParams();
    const authHash = await deriveAuthHash(TEST_PASSWORD, kdfParams);
    const material = await buildRegistrationMaterial(
      TEST_PASSWORD,
      kdfParams,
      "racer@example.com",
    );

    const attempt = () =>
      registerUser(ctx.db, {
        email: "racer@example.com",
        authHash,
        kdfParams,
        protectedVaultKey: material.protectedVaultKey,
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("logs in with correct credentials and returns vault material", async () => {
    const user = await createTestUser(ctx.db, { email: "login@example.com" });

    const result = await loginUser(ctx.db, {
      email: "LOGIN@example.com",
      authHash: user.authHash,
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.user.id).toBe(user.id);
      expect(result.user.protectedVaultKey).toBe(user.protectedVaultKey);
      expect(result.token.length).toBeGreaterThan(20);
    }
  });

  it("rejects bad credentials without revealing the account state", async () => {
    const user = await createTestUser(ctx.db, { email: "bad@example.com" });
    const wrongHash = "f".repeat(64);

    const knownUser = await loginUser(ctx.db, {
      email: user.email,
      authHash: wrongHash,
    });
    const unknownUser = await loginUser(ctx.db, {
      email: "nobody@example.com",
      authHash: wrongHash,
    });

    expect(knownUser.status).toBe("invalid");
    expect(unknownUser.status).toBe("invalid");

    const events = await ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, "auth.login.failed"));
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses login for a disabled account", async () => {
    const user = await createTestUser(ctx.db, { email: "disabled@example.com" });
    await ctx.db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, user.id));

    const result = await loginUser(ctx.db, {
      email: user.email,
      authHash: user.authHash,
    });
    expect(result.status).toBe("invalid");
  });

  it("revokes a session on logout", async () => {
    const user = await createTestUser(ctx.db, { email: "logout@example.com" });
    const { token, session } = await createSession(ctx.db, user.id);

    await logoutUser(ctx.db, session.id, user.id);

    expect((await resolveSession(ctx.db, token)).status).toBe("none");
  });

  it("changes the master password, rotates the stamp and revokes other sessions", async () => {
    const user = await createTestUser(ctx.db, { email: "rotate@example.com" });
    // Drop the session created during registration so the count is exact.
    await revokeAllSessions(ctx.db, user.id);

    const current = await createSession(ctx.db, user.id);
    const other = await createSession(ctx.db, user.id);

    const newPassword = "a new and much better pass";
    const newParams = cheapKdfParams();
    const newAuthHash = await deriveAuthHash(newPassword, newParams);
    const rewrapped = await rewrapVaultKey(
      user.vaultKey,
      newPassword,
      newParams,
      normalizeEmail(user.email),
    );

    const result = await changeMasterPassword(ctx.db, {
      userId: user.id,
      sessionId: current.session.id,
      currentAuthHash: user.authHash,
      authHash: newAuthHash,
      kdfParams: newParams,
      protectedVaultKey: rewrapped.protectedVaultKey,
    });

    expect(result.securityStamp).toMatch(/^[0-9a-f]{32}$/);
    expect(result.revokedSessions).toBe(1);

    expect((await resolveSession(ctx.db, current.token)).status).toBe("active");
    expect((await resolveSession(ctx.db, other.token)).status).toBe("none");

    const [updated] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(updated.protectedVaultKey).toBe(rewrapped.protectedVaultKey);
    expect(updated.kdfParams.salt).toBe(newParams.salt);
  });

  it("rejects a password change with the wrong current password", async () => {
    const user = await createTestUser(ctx.db, { email: "reauth@example.com" });
    const { session } = await createSession(ctx.db, user.id);
    const newParams = cheapKdfParams();

    await expect(
      changeMasterPassword(ctx.db, {
        userId: user.id,
        sessionId: session.id,
        currentAuthHash: "0".repeat(64),
        authHash: await deriveAuthHash("another password here", newParams),
        kdfParams: newParams,
        protectedVaultKey: user.protectedVaultKey,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
