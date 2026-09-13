import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";
import { createTestUser } from "@/test/helpers/auth";
import { createTestDb, type TestDb } from "@/test/helpers/db";

const dbHolder = vi.hoisted(() => ({ current: null as unknown as Database }));
vi.mock("@/lib/db/client", () => ({ getDb: () => dbHolder.current }));

import { DELETE as deleteProvider, PATCH as patchProvider } from "@/app/api/ai/providers/[id]/route";
import { GET as listProviders, POST as createProvider } from "@/app/api/ai/providers/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/ai/settings/route";

const ORIGIN = "http://localhost:3000";
const HOST = "localhost:3000";

function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  cookie?: string,
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: HOST,
    origin: ORIGIN,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, cookie?: string): Request {
  const headers: Record<string, string> = { host: HOST };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { headers });
}

const cookieFor = (token: string) => `ahaai_session=${token}`;

describe("ai provider routes", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
    dbHolder.current = ctx.db as unknown as Database;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("requires authentication", async () => {
    const response = await listProviders(getRequest("/api/ai/providers"));
    expect(response.status).toBe(401);
  });

  it("creates and lists providers without leaking the key", async () => {
    const user = await createTestUser(ctx.db, { email: "ai-route@example.com" });
    const cookie = cookieFor(user.token);

    const created = await createProvider(
      jsonRequest(
        "/api/ai/providers",
        "POST",
        { presetId: "openai", label: "main", apiKey: "sk-live-abcdef123456" },
        cookie,
      ),
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.provider.hasApiKey).toBe(true);
    expect(JSON.stringify(createdBody)).not.toContain("sk-live-abcdef123456");

    const list = await listProviders(getRequest("/api/ai/providers", cookie));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.providers).toHaveLength(1);
    expect(listBody.presets.some((p: { id: string }) => p.id === "ollama")).toBe(
      true,
    );
  });

  it("does not let one user touch another user's provider", async () => {
    const alice = await createTestUser(ctx.db, { email: "ai-route-alice@example.com" });
    const bob = await createTestUser(ctx.db, { email: "ai-route-bob@example.com" });

    const created = await createProvider(
      jsonRequest(
        "/api/ai/providers",
        "POST",
        { presetId: "ollama", label: "local" },
        cookieFor(alice.token),
      ),
    );
    const { provider } = await created.json();

    const patched = await patchProvider(
      jsonRequest(
        `/api/ai/providers/${provider.id}`,
        "PATCH",
        { label: "hijacked" },
        cookieFor(bob.token),
      ),
      { params: Promise.resolve({ id: provider.id }) },
    );
    expect(patched.status).toBe(404);

    const removed = await deleteProvider(
      jsonRequest(
        `/api/ai/providers/${provider.id}`,
        "DELETE",
        {},
        cookieFor(bob.token),
      ),
      { params: Promise.resolve({ id: provider.id }) },
    );
    expect(removed.status).toBe(404);
  });

  it("updates AI settings", async () => {
    const user = await createTestUser(ctx.db, { email: "ai-route-settings@example.com" });
    const cookie = cookieFor(user.token);

    const initial = await getSettings(getRequest("/api/ai/settings", cookie));
    expect(initial.status).toBe(200);
    expect((await initial.json()).settings.aiMode).toBe("cloud");

    const updated = await putSettings(
      jsonRequest("/api/ai/settings", "PUT", { aiMode: "local" }, cookie),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).settings.aiMode).toBe("local");
  });
});
