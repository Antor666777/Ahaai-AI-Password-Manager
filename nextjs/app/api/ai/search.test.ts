import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mintToken } from "@/lib/crypto/tokenize";
import type { Database } from "@/lib/db/types";
import { createTestUser } from "@/test/helpers/auth";
import { createTestDb, type TestDb } from "@/test/helpers/db";

const dbHolder = vi.hoisted(() => ({ current: null as unknown as Database }));
vi.mock("@/lib/db/client", () => ({ getDb: () => dbHolder.current }));

const searchMock = vi.hoisted(() => ({
  searchVault: vi.fn(),
}));
vi.mock("@/lib/ai/search", () => ({
  searchVault: searchMock.searchVault,
}));

import { POST as searchRoute } from "@/app/api/ai/search/route";

const ORIGIN = "http://localhost:3000";

function request(body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "localhost:3000",
    origin: ORIGIN,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/ai/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const cookieFor = (token: string) => `ahaai_session=${token}`;

function validBody() {
  return {
    query: "my duolingo alt",
    mode: "cloud",
    candidates: [{ token: mintToken(), title: "Duolingo alt" }],
  };
}

describe("ai search route", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
    dbHolder.current = ctx.db as unknown as Database;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("requires authentication", async () => {
    const response = await searchRoute(request(validBody()));
    expect(response.status).toBe(401);
  });

  it("returns matches from the search service", async () => {
    const user = await createTestUser(ctx.db, { email: "search@example.com" });
    const token = mintToken();
    searchMock.searchVault.mockResolvedValueOnce({
      matches: [{ token, reason: "matches", score: 0.9 }],
      presetId: "openai",
      modelId: "gpt-4o-mini",
      isLocal: false,
      mode: "cloud",
      candidateCount: 1,
      truncated: false,
    });

    const response = await searchRoute(
      request(
        {
          query: "my duolingo alt",
          mode: "cloud",
          candidates: [{ token, title: "Duolingo alt" }],
        },
        cookieFor(user.token),
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.matches[0].token).toBe(token);
    expect(body.modelId).toBe("gpt-4o-mini");
  });

  it("rejects invalid tokens and empty queries", async () => {
    const user = await createTestUser(ctx.db, { email: "search2@example.com" });
    const cookie = cookieFor(user.token);

    const badToken = await searchRoute(
      request(
        {
          query: "hello",
          mode: "cloud",
          candidates: [{ token: "not-a-token", title: "x" }],
        },
        cookie,
      ),
    );
    expect(badToken.status).toBe(400);

    const badQuery = await searchRoute(
      request({ query: "", mode: "cloud", candidates: [{ token: mintToken(), title: "x" }] }, cookie),
    );
    expect(badQuery.status).toBe(400);
  });

  it("rejects an unknown mode", async () => {
    const user = await createTestUser(ctx.db, { email: "search3@example.com" });
    const response = await searchRoute(
      request(
        {
          query: "hello",
          mode: "sideways",
          candidates: [{ token: mintToken(), title: "x" }],
        },
        cookieFor(user.token),
      ),
    );
    expect(response.status).toBe(400);
  });
});
