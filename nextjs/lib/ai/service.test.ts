import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptApiKey } from "./crypto";
import { createTestUser } from "@/test/helpers/auth";
import { createTestDb, type TestDb } from "@/test/helpers/db";
import { toPublicProvider } from "./serializers";
import {
  createProvider,
  deleteProvider,
  getAiSettings,
  getProvider,
  listProviders,
  updateAiSettings,
  updateProvider,
} from "./service";

describe("ai provider service", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("creates a cloud provider and encrypts the API key", async () => {
    const user = await createTestUser(ctx.db, { email: "ai1@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "main",
      apiKey: "sk-live-1234567890abcd",
    });

    expect(provider.apiKeyEnc).not.toBeNull();
    expect(provider.apiKeyEnc).not.toContain("sk-live");
    expect(decryptApiKey(provider.apiKeyEnc as string)).toBe(
      "sk-live-1234567890abcd",
    );

    const publicView = toPublicProvider(provider);
    expect(publicView.hasApiKey).toBe(true);
    expect(publicView.apiKeyMask).toBe("********abcd");
    expect(JSON.stringify(publicView)).not.toContain("sk-live-1234567890abcd");
  });

  it("creates a local provider without a key", async () => {
    const user = await createTestUser(ctx.db, { email: "ai2@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "ollama",
      label: "local",
    });

    expect(provider.isLocal).toBe(true);
    expect(provider.apiKeyEnc).toBeNull();
    expect(provider.baseUrl).toBe("http://localhost:11434/v1");
    expect(provider.defaultModel).toBe("llama3.2");
  });

  it("rejects unknown presets and missing keys", async () => {
    const user = await createTestUser(ctx.db, { email: "ai3@example.com" });

    await expect(
      createProvider(ctx.db, user.id, { presetId: "nope", label: "x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      createProvider(ctx.db, user.id, { presetId: "openai", label: "x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unsafe custom base URLs", async () => {
    const user = await createTestUser(ctx.db, { email: "ai4@example.com" });

    await expect(
      createProvider(ctx.db, user.id, {
        presetId: "custom-openai",
        label: "evil",
        baseUrl: "http://169.254.169.254/v1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces unique preset+label per user", async () => {
    const user = await createTestUser(ctx.db, { email: "ai5@example.com" });
    await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "dup",
      apiKey: "sk-a",
    });

    await expect(
      createProvider(ctx.db, user.id, {
        presetId: "openai",
        label: "dup",
        apiKey: "sk-b",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("isolates providers between users", async () => {
    const alice = await createTestUser(ctx.db, { email: "ai-alice@example.com" });
    const bob = await createTestUser(ctx.db, { email: "ai-bob@example.com" });
    const provider = await createProvider(ctx.db, alice.id, {
      presetId: "openai",
      label: "alice",
      apiKey: "sk-a",
    });

    await expect(getProvider(ctx.db, bob.id, provider.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await listProviders(ctx.db, bob.id)).toHaveLength(0);
  });

  it("updates and rotates the API key", async () => {
    const user = await createTestUser(ctx.db, { email: "ai6@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "rotate",
      apiKey: "sk-old-0000",
    });

    const updated = await updateProvider(ctx.db, user.id, provider.id, {
      apiKey: "sk-new-1111",
      defaultModel: "gpt-4o-mini",
    });

    expect(decryptApiKey(updated.apiKeyEnc as string)).toBe("sk-new-1111");
    expect(updated.defaultModel).toBe("gpt-4o-mini");
  });

  it("refuses to clear a required API key", async () => {
    const user = await createTestUser(ctx.db, { email: "ai7@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "required",
      apiKey: "sk-a",
    });

    await expect(
      updateProvider(ctx.db, user.id, provider.id, { apiKey: null }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deletes providers", async () => {
    const user = await createTestUser(ctx.db, { email: "ai8@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "gone",
      apiKey: "sk-a",
    });

    await deleteProvider(ctx.db, user.id, provider.id);
    await expect(getProvider(ctx.db, user.id, provider.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("updates AI settings and validates provider ownership", async () => {
    const alice = await createTestUser(ctx.db, { email: "ai-set-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "ai-set-b@example.com" });
    const provider = await createProvider(ctx.db, alice.id, {
      presetId: "ollama",
      label: "local",
    });

    const settings = await updateAiSettings(ctx.db, alice.id, {
      aiMode: "local",
      defaultProviderId: provider.id,
    });
    expect(settings.aiMode).toBe("local");
    expect(settings.defaultProviderId).toBe(provider.id);

    await expect(
      updateAiSettings(ctx.db, bob.id, { defaultProviderId: provider.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect((await getAiSettings(ctx.db, alice.id)).aiMode).toBe("local");
  });

  it("moves the mode to match a newly chosen default provider", async () => {
    const user = await createTestUser(ctx.db, { email: "ai-set-c@example.com" });
    const hosted = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "hosted",
      apiKey: "sk-test",
    });

    // Start on local, then choose a hosted default: the mode follows it.
    await updateAiSettings(ctx.db, user.id, { aiMode: "local" });
    const followed = await updateAiSettings(ctx.db, user.id, {
      defaultProviderId: hosted.id,
    });
    expect(followed.aiMode).toBe("cloud");

    // An explicit mode in the same call still wins.
    const explicit = await updateAiSettings(ctx.db, user.id, {
      aiMode: "local",
      defaultProviderId: hosted.id,
    });
    expect(explicit.aiMode).toBe("local");
  });
});
