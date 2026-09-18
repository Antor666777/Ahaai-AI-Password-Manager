import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestUser } from "@ahaai/testing/helpers/auth";
import { createTestDb, type TestDb } from "@ahaai/testing/helpers/db";
import { createProvider, updateAiSettings, updateProvider } from "./service";
import { resolveEvaluationModel, resolveLanguageModel } from "./resolve";

describe("resolveLanguageModel", () => {
  let ctx: TestDb;
  const originalOpenAi = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAi;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it("falls back to an environment key when no provider is configured", async () => {
    process.env.OPENAI_API_KEY = "sk-env-test";
    const user = await createTestUser(ctx.db, { email: "res1@example.com" });

    const resolved = await resolveLanguageModel(ctx.db, user.id);
    expect(resolved.source).toBe("environment");
    expect(resolved.presetId).toBe("openai");
    expect(resolved.isLocal).toBe(false);
    expect(resolved.modelId).toBe("gpt-4o");
  });

  it("errors when nothing is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const user = await createTestUser(ctx.db, { email: "res2@example.com" });

    await expect(resolveLanguageModel(ctx.db, user.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("resolves a local provider in local mode", async () => {
    const user = await createTestUser(ctx.db, { email: "res3@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "ollama",
      label: "local",
    });
    await updateAiSettings(ctx.db, user.id, { defaultProviderId: provider.id });

    const resolved = await resolveLanguageModel(ctx.db, user.id, {
      mode: "local",
    });
    expect(resolved.presetId).toBe("ollama");
    expect(resolved.isLocal).toBe(true);
    expect(resolved.modelId).toBe("llama3.2");
    expect(resolved.source).toBe("database");
  });

  it("honours a model override", async () => {
    const user = await createTestUser(ctx.db, { email: "res4@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "openai",
      apiKey: "sk-test",
    });

    const resolved = await resolveLanguageModel(ctx.db, user.id, {
      providerId: provider.id,
      model: "gpt-4o-mini",
      mode: "cloud",
    });
    expect(resolved.modelId).toBe("gpt-4o-mini");
  });

  it("treats an explicit provider that contradicts the mode as a preference", async () => {
    const user = await createTestUser(ctx.db, { email: "res5@example.com" });
    const cloud = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "cloud",
      apiKey: "sk-test",
    });
    const local = await createProvider(ctx.db, user.id, {
      presetId: "ollama",
      label: "local",
    });

    const localPick = await resolveLanguageModel(ctx.db, user.id, {
      providerId: cloud.id,
      mode: "local",
    });
    expect(localPick.presetId).toBe("ollama");

    const cloudPick = await resolveLanguageModel(ctx.db, user.id, {
      providerId: local.id,
      mode: "cloud",
    });
    expect(cloudPick.presetId).toBe("openai");
  });

  it("does not resolve another user's provider", async () => {
    const alice = await createTestUser(ctx.db, { email: "res-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "res-b@example.com" });
    const provider = await createProvider(ctx.db, alice.id, {
      presetId: "openai",
      label: "alice",
      apiKey: "sk-a",
    });

    await expect(
      resolveLanguageModel(ctx.db, bob.id, { providerId: provider.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("picks a local provider when the default is hosted and the mode is local", async () => {
    const user = await createTestUser(ctx.db, { email: "res-mode-a@example.com" });
    const hosted = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "hosted",
      apiKey: "sk-test",
    });
    await createProvider(ctx.db, user.id, { presetId: "ollama", label: "local" });
    await updateAiSettings(ctx.db, user.id, { defaultProviderId: hosted.id });

    const resolved = await resolveLanguageModel(ctx.db, user.id, {
      mode: "local",
    });
    expect(resolved.isLocal).toBe(true);
    expect(resolved.presetId).toBe("ollama");
  });

  it("explains what is missing when local mode has no local provider", async () => {
    const user = await createTestUser(ctx.db, { email: "res-mode-b@example.com" });
    const hosted = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "hosted",
      apiKey: "sk-test",
    });
    await updateAiSettings(ctx.db, user.id, { defaultProviderId: hosted.id });

    let failure: { message?: string; details?: unknown } = {};
    try {
      await resolveLanguageModel(ctx.db, user.id, { mode: "local" });
    } catch (caught) {
      failure = caught as { message?: string; details?: unknown };
    }

    expect(failure.message).toMatch(/no local provider is set up/i);
    expect(failure.details).toMatchObject({
      reason: "no_matching_provider",
      mode: "local",
      alternativeMode: "cloud",
    });
  });

  it("picks a hosted provider when the default is local and the mode is cloud", async () => {
    const user = await createTestUser(ctx.db, { email: "res-mode-c@example.com" });
    const local = await createProvider(ctx.db, user.id, {
      presetId: "ollama",
      label: "local",
    });
    await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "hosted",
      apiKey: "sk-test",
    });
    await updateAiSettings(ctx.db, user.id, { defaultProviderId: local.id });

    const resolved = await resolveLanguageModel(ctx.db, user.id, {
      mode: "cloud",
    });
    expect(resolved.isLocal).toBe(false);
    expect(resolved.presetId).toBe("openai");
  });
});

describe("resolveEvaluationModel", () => {
  let ctx: TestDb;
  const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
  const originalOpenAi = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    if (originalGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
    if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAi;
  });

  it("returns null rather than throwing when nothing is set up", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const user = await createTestUser(ctx.db, { email: "eval1@example.com" });

    await expect(
      resolveEvaluationModel(ctx.db, user.id),
    ).resolves.toBeNull();
  });

  it("resolves a saved decision-model provider", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const user = await createTestUser(ctx.db, { email: "eval2@example.com" });
    await createProvider(ctx.db, user.id, {
      presetId: "vercel-gateway",
      label: "gateway",
      apiKey: "gw-test",
    });

    const resolved = await resolveEvaluationModel(ctx.db, user.id);
    expect(resolved?.presetId).toBe("vercel-gateway");
    expect(resolved?.modelId).toBe("typesafe-ai/jev");
    expect(resolved?.isLocal).toBe(false);
    expect(resolved?.source).toBe("database");
    expect(resolved?.zeroDataRetention).toBe(true);
  });

  it("keeps zero retention on by default and lets a provider turn it off", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const user = await createTestUser(ctx.db, { email: "eval-zdr@example.com" });
    const provider = await createProvider(ctx.db, user.id, {
      presetId: "vercel-gateway",
      label: "gateway",
      apiKey: "gw-test",
    });

    const before = await resolveEvaluationModel(ctx.db, user.id);
    expect(before?.zeroDataRetention).toBe(true);

    // A plan that refuses the option turns it off for this provider alone.
    await updateProvider(ctx.db, user.id, provider.id, {
      zeroDataRetention: false,
    });

    const after = await resolveEvaluationModel(ctx.db, user.id);
    expect(after?.zeroDataRetention).toBe(false);
  });

  it("does not treat a language provider as a decision model", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const user = await createTestUser(ctx.db, { email: "eval3@example.com" });
    await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "openai",
      apiKey: "sk-test",
    });

    await expect(resolveEvaluationModel(ctx.db, user.id)).resolves.toBeNull();
  });

  it("prefers a decision model over a language default provider", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const user = await createTestUser(ctx.db, { email: "eval4@example.com" });
    const language = await createProvider(ctx.db, user.id, {
      presetId: "openai",
      label: "openai",
      apiKey: "sk-test",
    });
    await createProvider(ctx.db, user.id, {
      presetId: "vercel-gateway",
      label: "gateway",
      apiKey: "gw-test",
    });
    await updateAiSettings(ctx.db, user.id, { defaultProviderId: language.id });

    const resolved = await resolveEvaluationModel(ctx.db, user.id);
    expect(resolved?.presetId).toBe("vercel-gateway");
  });

  it("falls back to the gateway environment key", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-env";
    const user = await createTestUser(ctx.db, { email: "eval5@example.com" });

    const resolved = await resolveEvaluationModel(ctx.db, user.id);
    expect(resolved?.source).toBe("environment");
    expect(resolved?.presetId).toBe("vercel-gateway");
  });

  it("does not resolve another user's decision model", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const alice = await createTestUser(ctx.db, { email: "eval-a@example.com" });
    const bob = await createTestUser(ctx.db, { email: "eval-b@example.com" });
    const provider = await createProvider(ctx.db, alice.id, {
      presetId: "vercel-gateway",
      label: "alice",
      apiKey: "gw-a",
    });

    await expect(
      resolveEvaluationModel(ctx.db, bob.id, { providerId: provider.id }),
    ).resolves.toBeNull();
  });

  it("keeps a decision model out of the language path", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const user = await createTestUser(ctx.db, { email: "eval6@example.com" });
    await createProvider(ctx.db, user.id, {
      presetId: "vercel-gateway",
      label: "gateway",
      apiKey: "gw-test",
    });

    await expect(
      resolveLanguageModel(ctx.db, user.id, { mode: "cloud" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
