import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveMasterKey } from "@ahaai/core/crypto/kdf";
import { splitMasterKey } from "@ahaai/core/crypto/split";
import {
  buildRegistrationMaterial,
  rewrapVaultKey,
  unwrapVaultKey,
} from "@ahaai/core/crypto/vault-key";
import {
  folders,
  items,
  securityEvents,
  sessions,
  userSettings,
  users,
} from "@ahaai/db/schema";
import { createTestUser, deriveAuthHash, TEST_PASSWORD } from "@ahaai/testing/helpers/auth";
import { cheapKdfParams } from "@ahaai/testing/helpers/crypto";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import {
  changeEmail,
  changeMasterPassword,
  checkAuthHash,
  deleteAccount,
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

  it("checks a master password through the one shared comparison", async () => {
    const user = await createTestUser(ctx.db, { email: "verify@example.com" });
    const [row] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    expect(await checkAuthHash(row, user.authHash)).toBe(true);
    expect(await checkAuthHash(row, "0".repeat(64))).toBe(false);
  });

  it("changes the email, re-wraps the vault key and signs out other devices", async () => {
    const oldEmail = "change-old@example.com";
    const newEmail = "change-new@example.com";
    const user = await createTestUser(ctx.db, { email: oldEmail });
    // Drop the session registration created so the revoked count is exact.
    await revokeAllSessions(ctx.db, user.id);

    const current = await createSession(ctx.db, user.id);
    const other = await createSession(ctx.db, user.id);

    const [before] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    const rewrapped = await rewrapVaultKey(
      user.vaultKey,
      user.password,
      user.kdfParams,
      normalizeEmail(newEmail),
    );

    const result = await changeEmail(ctx.db, {
      userId: user.id,
      sessionId: current.session.id,
      email: newEmail,
      protectedVaultKey: rewrapped.protectedVaultKey,
    });

    expect(result.user.email).toBe(newEmail);
    expect(result.user.emailNormalized).toBe(normalizeEmail(newEmail));
    expect(result.user.protectedVaultKey).toBe(rewrapped.protectedVaultKey);
    expect(result.revokedSessions).toBe(1);

    // This device stays signed in; every other session is gone.
    expect((await resolveSession(ctx.db, current.token)).status).toBe("active");
    expect((await resolveSession(ctx.db, other.token)).status).toBe("none");

    // The assertion that guards the real risk: the stored envelope opens with
    // the NEW address binding and not with the old one. Get this wrong and it
    // fails only at unlock time, with a GCM tag error.
    const { encKey } = splitMasterKey(
      await deriveMasterKey(user.password, user.kdfParams),
    );
    const opened = unwrapVaultKey(
      rewrapped.protectedVaultKey,
      encKey,
      normalizeEmail(newEmail),
    );
    expect(Array.from(opened)).toEqual(Array.from(user.vaultKey));
    expect(() =>
      unwrapVaultKey(
        rewrapped.protectedVaultKey,
        encKey,
        normalizeEmail(oldEmail),
      ),
    ).toThrow();

    const [after] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(after.email).toBe(newEmail);
    expect(after.securityStamp).not.toBe(before.securityStamp);

    const events = await ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, "auth.email.changed"));
    expect(events.some((event) => event.userId === user.id)).toBe(true);
  });

  it("deletes the account, cascades its data and keeps an anonymised audit trail", async () => {
    const user = await createTestUser(ctx.db, { email: "delete@example.com" });

    const [folder] = await ctx.db
      .insert(folders)
      .values({ userId: user.id, nameEnc: "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB" })
      .returning();
    await ctx.db.insert(items).values({
      userId: user.id,
      type: "login",
      nameEnc: "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB",
      dataEnc: "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB",
      folderId: folder.id,
    });

    const result = await deleteAccount(ctx.db, {
      userId: user.id,
      authHash: user.authHash,
    });
    expect(result).toEqual({ deleted: true });

    expect(
      await ctx.db.select().from(users).where(eq(users.id, user.id)),
    ).toHaveLength(0);
    expect(
      await ctx.db.select().from(items).where(eq(items.userId, user.id)),
    ).toHaveLength(0);
    expect(
      await ctx.db.select().from(folders).where(eq(folders.userId, user.id)),
    ).toHaveLength(0);
    expect(
      await ctx.db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toHaveLength(0);

    // The audit row is written before the delete, so the ON DELETE SET NULL FK
    // anonymises it instead of the cascade erasing it.
    const deleted = await ctx.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, "auth.account.deleted"));
    expect(deleted).toHaveLength(1);
    expect(deleted[0].severity).toBe("critical");
    expect(deleted[0].userId).toBeNull();
  });

  it("refuses to delete the account with the wrong master password", async () => {
    const user = await createTestUser(ctx.db, { email: "delete-wrong@example.com" });

    await expect(
      deleteAccount(ctx.db, { userId: user.id, authHash: "0".repeat(64) }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(
      await ctx.db.select().from(users).where(eq(users.id, user.id)),
    ).toHaveLength(1);
  });
});
