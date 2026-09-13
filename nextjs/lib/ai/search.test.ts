import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";
import { mintToken } from "@/lib/crypto/tokenize";
import type { ResolvedModel } from "./resolve";
import {
  SEARCH_SYSTEM_PROMPT,
  buildSearchPrompt,
  renderCandidateBlock,
  searchVault,
  type SearchDeps,
} from "./search";

const db = {} as Database;

function resolved(overrides: Partial<ResolvedModel> = {}): ResolvedModel {
  return {
    presetId: "openai",
    modelId: "gpt-4o-mini",
    isLocal: false,
    source: "database",
    model: {} as unknown as LanguageModel,
    ...overrides,
  };
}

describe("renderCandidateBlock", () => {
  it("includes all provided metadata", () => {
    const token = mintToken();
    const { block, truncated } = renderCandidateBlock([
      {
        token,
        title: "Duolingo alt",
        domain: "duolingo.com",
        note: "the second account",
      },
    ]);

    expect(truncated).toBe(false);
    expect(block).toContain(`token=${token}`);
    expect(block).toContain('"Duolingo alt"');
    expect(block).toContain("duolingo.com");
    expect(block).toContain("the second account");
  });

  it("omits absent notes and domains", () => {
    const { block } = renderCandidateBlock([{ token: mintToken(), title: "Just a title" }]);
    expect(block).not.toContain("note=");
    expect(block).not.toContain("domain=");
  });

  it("stops at the character budget and flags truncation", () => {
    const candidates = Array.from({ length: 20 }, () => ({
      token: mintToken(),
      title: "x".repeat(50),
    }));
    const { block, truncated } = renderCandidateBlock(candidates, 200);
    expect(truncated).toBe(true);
    expect(block.length).toBeLessThanOrEqual(200);
  });
});

describe("buildSearchPrompt", () => {
  it("includes the query and candidate block", () => {
    const prompt = buildSearchPrompt("my duolingo alt", "- token=t_abc");
    expect(prompt).toContain('"my duolingo alt"');
    expect(prompt).toContain("token=t_abc");
    expect(prompt).toContain("untrusted data");
  });

  it("documents the prompt-injection and token-only rules", () => {
    expect(SEARCH_SYSTEM_PROMPT).toContain("Never invent");
    expect(SEARCH_SYSTEM_PROMPT).toContain("untrusted data");
    expect(SEARCH_SYSTEM_PROMPT).toContain("never output any");
  });
});

describe("searchVault", () => {
  const tokens = [mintToken(), mintToken(), mintToken()];
  const candidates = tokens.map((token, index) => ({
    token,
    title: `Credential ${index}`,
  }));

  it("returns only tokens that were sent, deduped and capped", async () => {
    const resolve = vi.fn(async () => resolved());
    const generate = vi.fn(async () => ({
      object: {
        matches: [
          { token: tokens[0], reason: "duolingo alt", score: 0.9 },
          { token: mintToken(), reason: "hallucinated", score: 1 },
          { token: tokens[0], reason: "duplicate", score: 0.5 },
          { token: tokens[1], score: 5 },
        ],
      },
    })) as unknown as SearchDeps["generate"];

    const result = await searchVault(
      db,
      "user-1",
      { query: "duolingo", mode: "cloud", candidates },
      { resolve, generate },
    );

    expect(result.matches.map((match) => match.token)).toEqual([
      tokens[0],
      tokens[1],
    ]);
    expect(result.matches[1].score).toBe(1);
    expect(result.presetId).toBe("openai");
    expect(result.candidateCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("forwards the mode and model to the resolver", async () => {
    const resolve = vi.fn(async () => resolved({ isLocal: true, presetId: "ollama" }));
    const generate = vi.fn(async () => ({ object: { matches: [] } })) as unknown as SearchDeps["generate"];

    await searchVault(
      db,
      "user-1",
      { query: "anything", mode: "local", model: "llama3.2", candidates },
      { resolve, generate },
    );

    expect(resolve).toHaveBeenCalledWith(
      db,
      "user-1",
      expect.objectContaining({ mode: "local", model: "llama3.2" }),
    );
  });

  it("sends the candidate tokens and query to the model", async () => {
    let capturedPrompt = "";
    const generate = (async (args: { prompt: string }) => {
      capturedPrompt = args.prompt;
      return { object: { matches: [] } };
    }) as unknown as SearchDeps["generate"];

    await searchVault(
      db,
      "user-1",
      { query: "grandpa youtube", mode: "cloud", candidates },
      { resolve: async () => resolved(), generate },
    );

    expect(capturedPrompt).toContain("grandpa youtube");
    for (const token of tokens) expect(capturedPrompt).toContain(token);
  });

  it("maps generation failures to a 502", async () => {
    const generate = (async () => {
      throw new Error("provider exploded");
    }) as unknown as SearchDeps["generate"];

    await expect(
      searchVault(
        db,
        "user-1",
        { query: "x", mode: "cloud", candidates },
        { resolve: async () => resolved(), generate },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM", status: 502 });
  });

  it("maps an unexpected model shape to a 502", async () => {
    const generate = (async () => ({
      object: { notMatches: true },
    })) as unknown as SearchDeps["generate"];

    await expect(
      searchVault(
        db,
        "user-1",
        { query: "x", mode: "cloud", candidates },
        { resolve: async () => resolved(), generate },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("propagates resolver errors (for example a mode mismatch)", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("bad mode");
    });

    await expect(
      searchVault(
        db,
        "user-1",
        { query: "x", mode: "local", candidates },
        { resolve, generate: async () => ({ object: { matches: [] } }) },
      ),
    ).rejects.toThrow("bad mode");
  });
});
