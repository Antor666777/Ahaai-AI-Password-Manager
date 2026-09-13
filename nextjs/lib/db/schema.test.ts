import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/helpers/db";
import { aiProviders, sessions, users } from "./schema";

function newUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return {
    email: "ada@example.com",
    emailNormalized: "ada@example.com",
    authHash: "auth-hash",
    authSalt: "auth-salt",
    authParams: {
      algo: "argon2id" as const,
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
    },
    kdfParams: {
      algo: "argon2id" as const,
      version: 1,
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
      salt: "c2FsdA==",
    },
    protectedVaultKey: "v1.iv.ct",
    securityStamp: "stamp",
    ...overrides,
  };
}

describe("database schema", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("applies migrations and inserts a user with defaults", async () => {
    const [row] = await ctx.db.insert(users).values(newUser()).returning();
    expect(row.id).toBeTruthy();
    expect(row.emailVerified).toBe(false);
    expect(row.kdfVersion).toBe(1);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("enforces unique normalized email", async () => {
    await expect(
      ctx.db.insert(users).values(newUser({ email: "other@example.com" })),
    ).rejects.toThrow();
  });

  it("cascades deletes from users to sessions", async () => {
    const [user] = await ctx.db
      .insert(users)
      .values(newUser({ emailNormalized: "cascade@example.com" }))
      .returning();

    await ctx.db.insert(sessions).values({
      userId: user.id,
      tokenHash: "token-hash",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await ctx.db.delete(users).where(eq(users.id, user.id));

    const remaining = await ctx.db.select().from(sessions);
    expect(remaining).toHaveLength(0);
  });

  it("rejects rows that violate foreign keys", async () => {
    const result = await ctx.db
      .insert(aiProviders)
      .values({
        userId: "00000000-0000-0000-0000-000000000000",
        presetId: "openai",
        label: "default",
      })
      .catch(() => null);

    expect(result).toBeNull();
  });
});
