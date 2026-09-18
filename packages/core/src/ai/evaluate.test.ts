import { describe, expect, it } from "vitest";
import { Experimental_EvaluationMockModelV4 as EvaluationMockModel } from "ai/test";
import { mintToken } from "@ahaai/core/crypto/tokenize";
import {
  INTENT_QUESTION,
  buildEvaluationQuestions,
  buildEvaluationState,
  decideMatches,
  privacyProviderOptions,
  readIntent,
  readProbability,
} from "./evaluate";

const SUPPORTED_QUESTION_TYPES = ["boolean", "choice"] as const;

describe("buildEvaluationState", () => {
  it("carries only the token and the three non-secret metadata fields", () => {
    const candidate = {
      token: mintToken(),
      title: "Bank",
      note: "joint account",
      domain: "bank.example",
      password: "hunter2",
      username: "me@example.com",
      apiKey: "sk-live-secret",
      id: "item-42",
    };

    const state = buildEvaluationState("bank", [candidate as never]);
    const serialized = JSON.stringify(state);

    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("me@example.com");
    expect(serialized).not.toContain("sk-live-secret");
    expect(serialized).not.toContain("item-42");
    expect(Object.keys(state.candidates[0] ?? {}).sort()).toEqual([
      "domain",
      "note",
      "title",
      "token",
    ]);
  });

  it("omits absent notes and domains", () => {
    const state = buildEvaluationState("x", [
      { token: mintToken(), title: "Just a title" },
    ]);
    expect(Object.keys(state.candidates[0] ?? {}).sort()).toEqual([
      "title",
      "token",
    ]);
  });
});

describe("buildEvaluationQuestions", () => {
  it("asks the intent question plus one boolean per candidate token", () => {
    const tokens = [mintToken(), mintToken()];
    const questions = buildEvaluationQuestions(
      tokens.map((token) => ({ token, title: "Item" })),
    );

    expect(questions[INTENT_QUESTION]).toMatchObject({ type: "choice" });
    for (const token of tokens) {
      expect(questions[token]).toMatchObject({ type: "boolean" });
    }
    expect(Object.keys(questions)).toHaveLength(tokens.length + 1);
  });
});

describe("readProbability", () => {
  it("clamps to [0, 1]", () => {
    expect(readProbability({ type: "boolean", probability: 5 })).toBe(1);
    expect(readProbability({ type: "boolean", probability: -3 })).toBe(0);
    expect(readProbability({ type: "boolean", probability: 0.85 })).toBe(0.85);
  });

  it("treats a missing or unusable answer as no match", () => {
    expect(readProbability(undefined)).toBeUndefined();
    expect(readProbability({ type: "boolean", probability: Number.NaN })).toBeUndefined();
    expect(readProbability({ type: "boolean" })).toBeUndefined();
    expect(readProbability({ type: "choice", choice: "lookup" })).toBeUndefined();
    expect(readProbability("nope")).toBeUndefined();
  });
});

describe("readIntent", () => {
  it("accepts only the declared intents", () => {
    expect(readIntent({ type: "choice", choice: "lookup" })).toBe("lookup");
    expect(readIntent({ type: "choice", choice: "clarify" })).toBe("clarify");
    expect(readIntent({ type: "choice", choice: "none" })).toBe("none");
    expect(readIntent({ type: "choice", choice: "made-up" })).toBeUndefined();
    expect(readIntent({ type: "boolean", probability: 1 })).toBeUndefined();
    expect(readIntent(undefined)).toBeUndefined();
  });
});

describe("decideMatches", () => {
  it("maps answers back to their tokens and reads the intent", async () => {
    const tokens = [mintToken(), mintToken()];
    const candidates = tokens.map((token, index) => ({
      token,
      title: `Item ${index}`,
    }));

    const model = new EvaluationMockModel({
      supportedQuestionTypes: SUPPORTED_QUESTION_TYPES,
      doEvaluate: async () => ({
        warnings: [],
        answers: {
          [INTENT_QUESTION]: { type: "choice", choice: "lookup" },
          [tokens[0]]: { type: "boolean", probability: 0.93 },
          [tokens[1]]: { type: "boolean", probability: 0.1 },
        },
      }),
    });

    const outcome = await decideMatches({
      model,
      query: "which bank",
      candidates,
      zeroDataRetention: true,
    });

    expect(outcome.intent).toBe("lookup");
    expect(outcome.decisions).toEqual([
      { token: tokens[0], probability: 0.93 },
      { token: tokens[1], probability: 0.1 },
    ]);
  });

  it("returns decisions in candidate order without ranking them", async () => {
    const tokens = [mintToken(), mintToken()];
    const model = new EvaluationMockModel({
      supportedQuestionTypes: SUPPORTED_QUESTION_TYPES,
      doEvaluate: async () => ({
        warnings: [],
        answers: {
          [INTENT_QUESTION]: { type: "choice", choice: "clarify" },
          [tokens[0]]: { type: "boolean", probability: 0.1 },
          [tokens[1]]: { type: "boolean", probability: 0.95 },
        },
      }),
    });

    const outcome = await decideMatches({
      model,
      query: "x",
      candidates: tokens.map((token) => ({ token, title: "Item" })),
      zeroDataRetention: true,
    });

    // Ranking belongs to the caller; this stays in the order it was asked.
    expect(outcome.decisions).toEqual([
      { token: tokens[0], probability: 0.1 },
      { token: tokens[1], probability: 0.95 },
    ]);
    expect(outcome.intent).toBe("clarify");
  });
});

describe("privacyProviderOptions", () => {
  it("asks for zero retention and no training only when enabled", () => {
    expect(privacyProviderOptions(true)).toEqual({
      gateway: { zeroDataRetention: true, disallowPromptTraining: true },
    });
    expect(privacyProviderOptions(false)).toBeUndefined();
  });

  it("reaches the request, so turning it off really drops both options", async () => {
    const token = mintToken();
    const seen: unknown[] = [];

    const model = new EvaluationMockModel({
      supportedQuestionTypes: SUPPORTED_QUESTION_TYPES,
      doEvaluate: async (options) => {
        seen.push(options.providerOptions);
        return {
          warnings: [],
          answers: {
            [INTENT_QUESTION]: { type: "choice", choice: "lookup" },
            [token]: { type: "boolean", probability: 0.9 },
          },
        };
      },
    });

    const candidates = [{ token, title: "Item" }];
    await decideMatches({ model, query: "x", candidates, zeroDataRetention: true });
    await decideMatches({ model, query: "x", candidates, zeroDataRetention: false });

    expect(seen[0]).toMatchObject({
      gateway: { zeroDataRetention: true, disallowPromptTraining: true },
    });
    // The SDK normalizes an absent providerOptions to an empty object; what
    // matters is that no gateway policy is sent at all.
    expect(seen[1]).toEqual({});
  });
});
