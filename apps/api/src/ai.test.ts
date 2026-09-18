import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mintToken } from "@ahaai/core/crypto/tokenize";
import { createTestUser } from "@ahaai/testing/helpers/auth";
import { cookieFor, createTestApi, type TestApi } from "./testing/client";

const searchMock = vi.hoisted(() => ({ searchVault: vi.fn() }));
vi.mock("@ahaai/core/ai/search", () => ({
  searchVault: searchMock.searchVault,
}));

let api: TestApi;

beforeAll(async () => {
  api = await createTestApi();
});

afterAll(async () => {
  await api.close();
});

describe("ai provider routes", () => {
  it("requires authentication", async () => {
    const response = await api.get("/api/v1/ai/providers");
    expect(response.status).toBe(401);
  });

  it("creates and lists providers without leaking the key", async () => {
    const user = await createTestUser(api.ctx.db, { email: "ai-route@example.com" });
    const options = { cookie: cookieFor(user.token) };

    const created = await api.post(
      "/api/v1/ai/providers",
      { presetId: "openai", label: "main", apiKey: "sk-live-abcdef123456" },
      options,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.provider.hasApiKey).toBe(true);
    expect(JSON.stringify(createdBody)).not.toContain("sk-live-abcdef123456");

    const list = await api.get("/api/v1/ai/providers", options);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.providers).toHaveLength(1);
    expect(
      listBody.presets.some((preset: { id: string }) => preset.id === "ollama"),
    ).toBe(true);
  });

  it("does not let one user touch another user's provider", async () => {
    const alice = await createTestUser(api.ctx.db, { email: "ai-alice@example.com" });
    const bob = await createTestUser(api.ctx.db, { email: "ai-bob@example.com" });

    const created = await api.post(
      "/api/v1/ai/providers",
      { presetId: "ollama", label: "local" },
      { cookie: cookieFor(alice.token) },
    );
    const { provider } = await created.json();

    const patched = await api.patch(
      `/api/v1/ai/providers/${provider.id}`,
      { label: "hijacked" },
      { cookie: cookieFor(bob.token) },
    );
    expect(patched.status).toBe(404);

    const removed = await api.del(`/api/v1/ai/providers/${provider.id}`, {
      cookie: cookieFor(bob.token),
    });
    expect(removed.status).toBe(404);
  });

  it("accepts a key for a custom endpoint at creation or later", async () => {
    const user = await createTestUser(api.ctx.db, { email: "ai-custom@example.com" });
    const options = { cookie: cookieFor(user.token) };

    const withKey = await api.post(
      "/api/v1/ai/providers",
      {
        presetId: "custom-openai",
        label: "gateway",
        baseUrl: "https://gateway.example.com/v1",
        defaultModel: "gpt-4o-mini",
        apiKey: "sk-gateway-abcdef123456",
      },
      options,
    );
    expect(withKey.status).toBe(201);
    expect(JSON.stringify(await withKey.json())).not.toContain("sk-gateway-abcdef123456");

    const keyless = await api.post(
      "/api/v1/ai/providers",
      {
        presetId: "custom-openai",
        label: "open-gateway",
        baseUrl: "https://open.example.com/v1",
        defaultModel: "gpt-4o-mini",
      },
      options,
    );
    expect(keyless.status).toBe(201);
    const keylessBody = await keyless.json();
    expect(keylessBody.provider.hasApiKey).toBe(false);

    const patched = await api.patch(
      `/api/v1/ai/providers/${keylessBody.provider.id}`,
      { apiKey: "sk-later-abcdef123456" },
      options,
    );
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.provider.hasApiKey).toBe(true);
    expect(patchedBody.provider.apiKeyMask).toBeTruthy();
    expect(JSON.stringify(patchedBody)).not.toContain("sk-later-abcdef123456");
  });

  it("updates AI settings", async () => {
    const user = await createTestUser(api.ctx.db, { email: "ai-settings@example.com" });
    const options = { cookie: cookieFor(user.token) };

    const initial = await api.get("/api/v1/ai/settings", options);
    expect(initial.status).toBe(200);
    expect((await initial.json()).settings.aiMode).toBe("cloud");

    const updated = await api.put("/api/v1/ai/settings", { aiMode: "local" }, options);
    expect(updated.status).toBe(200);
    expect((await updated.json()).settings.aiMode).toBe("local");
  });
});

describe("ai search route", () => {
  function validBody() {
    return {
      query: "my duolingo alt",
      mode: "cloud",
      candidates: [{ token: mintToken(), title: "Duolingo alt" }],
    };
  }

  it("requires authentication", async () => {
    const response = await api.post("/api/v1/ai/search", validBody());
    expect(response.status).toBe(401);
  });

  it("returns matches from the search service", async () => {
    const user = await createTestUser(api.ctx.db, { email: "search@example.com" });
    const token = mintToken();

    searchMock.searchVault.mockResolvedValueOnce({
      matches: [{ token, reason: "matches", score: 0.9, confidence: "strong" }],
      presetId: "vercel-gateway",
      modelId: "typesafe-ai/jev",
      isLocal: false,
      mode: "cloud",
      engine: "evaluation",
      intent: "lookup",
      zeroDataRetention: false,
      candidateCount: 1,
      shortlistCount: 1,
      truncated: false,
    });

    const response = await api.post(
      "/api/v1/ai/search",
      {
        query: "my duolingo alt",
        mode: "cloud",
        candidates: [{ token, title: "Duolingo alt" }],
      },
      { cookie: cookieFor(user.token) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.matches[0].token).toBe(token);
    expect(body.matches[0].confidence).toBe("strong");
    expect(body.modelId).toBe("typesafe-ai/jev");
    expect(body.engine).toBe("evaluation");
    expect(body.intent).toBe("lookup");
    expect(body.zeroDataRetention).toBe(false);
    expect(body.shortlistCount).toBe(1);
  });

  it("rejects invalid tokens and empty queries", async () => {
    const user = await createTestUser(api.ctx.db, { email: "search2@example.com" });
    const options = { cookie: cookieFor(user.token) };

    const badToken = await api.post(
      "/api/v1/ai/search",
      {
        query: "hello",
        mode: "cloud",
        candidates: [{ token: "not-a-token", title: "x" }],
      },
      options,
    );
    expect(badToken.status).toBe(400);

    const badQuery = await api.post(
      "/api/v1/ai/search",
      { query: "", mode: "cloud", candidates: [{ token: mintToken(), title: "x" }] },
      options,
    );
    expect(badQuery.status).toBe(400);
  });

  it("rejects an unknown mode", async () => {
    const user = await createTestUser(api.ctx.db, { email: "search3@example.com" });

    const response = await api.post(
      "/api/v1/ai/search",
      {
        query: "hello",
        mode: "sideways",
        candidates: [{ token: mintToken(), title: "x" }],
      },
      { cookie: cookieFor(user.token) },
    );
    expect(response.status).toBe(400);
  });
});
