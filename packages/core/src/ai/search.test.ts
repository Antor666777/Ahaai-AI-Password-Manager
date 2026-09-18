import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@ahaai/db/types";
import { mintToken } from "@ahaai/core/crypto/tokenize";
import type { ResolvedEvaluationModel, ResolvedModel } from "./resolve";
import { MAX_SHORTLIST } from "./shortlist";
import {
  SEARCH_SYSTEM_PROMPT,
  buildSearchPrompt,
  renderCandidateBlock,
  searchVault,
  type SearchDeps,
} from "./search";

const db = {} as Database;

/** No decision model configured: these tests exercise the language path. */
const noEvaluation = async () => null;

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

function resolvedEvaluation(): ResolvedEvaluationModel {
  return {
    presetId: "vercel-gateway",
    modelId: "typesafe-ai/jev",
    isLocal: false,
    source: "database",
    zeroDataRetention: true,
    model: {} as ResolvedEvaluationModel["model"],
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
      { resolve, generate, resolveEvaluation: noEvaluation },
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
      { resolve, generate, resolveEvaluation: noEvaluation },
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
      { resolve: async () => resolved(), generate, resolveEvaluation: noEvaluation },
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
        { resolve: async () => resolved(), generate, resolveEvaluation: noEvaluation },
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
        { resolve: async () => resolved(), generate, resolveEvaluation: noEvaluation },
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
        {
          resolve,
          generate: async () => ({ object: { matches: [] } }),
          resolveEvaluation: noEvaluation,
        },
      ),
    ).rejects.toThrow("bad mode");
  });
});

describe("searchVault with a decision model", () => {
  const tokens = [mintToken(), mintToken(), mintToken()];
  const candidates = tokens.map((token, index) => ({
    token,
    title: `Credential ${index}`,
  }));

  it("ranks by probability, bands confidence, and drops unknown tokens", async () => {
    const evaluate: NonNullable<SearchDeps["evaluate"]> = async () => ({
      intent: "lookup",
      decisions: [
        { token: tokens[1], probability: 0.2 },
        { token: tokens[2], probability: 0.85 },
        { token: tokens[0], probability: 0.55 },
        { token: mintToken(), probability: 0.99 },
      ],
    });

    const result = await searchVault(
      db,
      "user-1",
      { query: "bank", mode: "cloud", candidates },
      { resolveEvaluation: async () => resolvedEvaluation(), evaluate },
    );

    expect(result.engine).toBe("evaluation");
    expect(result.intent).toBe("lookup");
    expect(result.presetId).toBe("vercel-gateway");
    // 0.2 sits below the relevance floor, and the last token was never sent.
    expect(result.matches.map((match) => match.token)).toEqual([
      tokens[2],
      tokens[0],
    ]);
    expect(result.matches[0].confidence).toBe("strong");
    expect(result.matches[1].confidence).toBe("possible");
    expect(result.matches[0].reason.length).toBeGreaterThan(0);
  });

  it("falls back to the language model when no decision model is set up", async () => {
    const generate = vi.fn(async () => ({
      object: { matches: [{ token: tokens[0], reason: "duolingo", score: 0.9 }] },
    })) as unknown as SearchDeps["generate"];

    const result = await searchVault(
      db,
      "user-1",
      { query: "duolingo", mode: "cloud", candidates },
      {
        resolveEvaluation: noEvaluation,
        resolve: async () => resolved(),
        generate,
      },
    );

    expect(result.engine).toBe("language");
    // A language model's self-reported score is never presented as strong.
    expect(result.matches[0].confidence).toBe("possible");
    expect(generate).toHaveBeenCalled();
  });

  it("never uses a decision model in local mode", async () => {
    const resolveEvaluation = vi.fn(async () => resolvedEvaluation());
    const generate = vi.fn(async () => ({
      object: { matches: [] },
    })) as unknown as SearchDeps["generate"];

    const result = await searchVault(
      db,
      "user-1",
      { query: "x", mode: "local", candidates },
      {
        resolveEvaluation,
        resolve: async () => resolved({ isLocal: true, presetId: "ollama" }),
        generate,
      },
    );

    expect(resolveEvaluation).not.toHaveBeenCalled();
    expect(result.engine).toBe("language");
  });

  it("bounds the question set and flags a partly searched vault", async () => {
    const many = Array.from({ length: MAX_SHORTLIST + 10 }, (_, index) => ({
      token: mintToken(),
      title: `Item ${index}`,
    }));

    let askedAbout = 0;
    const evaluate: NonNullable<SearchDeps["evaluate"]> = async (args) => {
      askedAbout = args.candidates.length;
      return { decisions: [] };
    };

    const result = await searchVault(
      db,
      "user-1",
      { query: "anything", mode: "cloud", candidates: many },
      { resolveEvaluation: async () => resolvedEvaluation(), evaluate },
    );

    expect(askedAbout).toBe(MAX_SHORTLIST);
    expect(result.candidateCount).toBe(many.length);
    expect(result.shortlistCount).toBe(MAX_SHORTLIST);
    expect(result.truncated).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it("maps a decision-model failure to a 502", async () => {
    const evaluate: NonNullable<SearchDeps["evaluate"]> = async () => {
      throw new Error("provider exploded");
    };

    await expect(
      searchVault(
        db,
        "user-1",
        { query: "x", mode: "cloud", candidates },
        { resolveEvaluation: async () => resolvedEvaluation(), evaluate },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM", status: 502 });
  });

  it("carries the provider's retention preference into the decision call", async () => {
    let seen: boolean | undefined;
    const evaluate: NonNullable<SearchDeps["evaluate"]> = async (args) => {
      seen = args.zeroDataRetention;
      return { decisions: [] };
    };

    const result = await searchVault(
      db,
      "user-1",
      { query: "x", mode: "cloud", candidates },
      {
        resolveEvaluation: async () => ({
          ...resolvedEvaluation(),
          zeroDataRetention: false,
        }),
        evaluate,
      },
    );

    expect(seen).toBe(false);
    expect(result.zeroDataRetention).toBe(false);
  });
});
