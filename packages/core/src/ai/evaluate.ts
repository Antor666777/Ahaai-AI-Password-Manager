/**
 * Turns "which of these credentials does the query mean" into typed decisions.
 *
 * The evaluation model answers one boolean per candidate (is this the one?) plus
 * one choice for the query's intent, all in a single parallel round trip. It
 * receives the same non-secret metadata the language path receives, and nothing
 * else.
 */
import { experimental_evaluate } from "ai";
import type { EvaluationModel } from "./resolve";
import type { ShortlistInput } from "./shortlist";

/** Reserved question id; candidate tokens always start with `t_`. */
export const INTENT_QUESTION = "intent";

export const SEARCH_INTENTS = ["lookup", "clarify", "none"] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

const GATEWAY_PRIVACY_OPTIONS = {
  gateway: { zeroDataRetention: true, disallowPromptTraining: true },
} as const;

/**
 * Vercel applies retention and training policy per request. Zero Data Retention
 * needs a paid plan, so a provider can turn it off; when it is off neither
 * option is sent rather than sending one and being refused.
 */
export function privacyProviderOptions(zeroDataRetention: boolean) {
  return zeroDataRetention ? GATEWAY_PRIVACY_OPTIONS : undefined;
}

interface BooleanQuestion {
  readonly type: "boolean";
  readonly instructions: string;
  readonly criteria?: { readonly true?: string | null; readonly false?: string | null };
}

interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string | null>>;
}

type EvaluationQuestion = BooleanQuestion | ChoiceQuestion;

export interface EvaluateArgs {
  model: EvaluationModel;
  query: string;
  candidates: readonly ShortlistInput[];
  /** Ask the provider for zero retention and no training on this request. */
  zeroDataRetention: boolean;
}

export interface EvaluateDecision {
  token: string;
  /** P(this candidate is the one the query means), in [0, 1]. */
  probability: number;
}

export interface EvaluateOutcome {
  intent?: SearchIntent;
  decisions: EvaluateDecision[];
}

/**
 * Builds the shared state. Fields are listed explicitly rather than spread, so
 * only a token and the three non-secret metadata fields can ever leave the
 * server for the model. Credentials, usernames, identifiers, and provider
 * configuration have no path into this object.
 */
export function buildEvaluationState(
  query: string,
  candidates: readonly ShortlistInput[],
): {
  query: string;
  candidates: {
    token: string;
    title: string;
    domain?: string;
    note?: string;
  }[];
} {
  return {
    query,
    candidates: candidates.map((candidate) => ({
      token: candidate.token,
      title: candidate.title,
      ...(candidate.domain ? { domain: candidate.domain } : {}),
      ...(candidate.note ? { note: candidate.note } : {}),
    })),
  };
}

export function buildEvaluationQuestions(
  candidates: readonly ShortlistInput[],
): Record<string, EvaluationQuestion> {
  const questions: Record<string, EvaluationQuestion> = {
    [INTENT_QUESTION]: {
      type: "choice",
      instructions: "What is the user asking for?",
      criteria: {
        lookup: "the query asks to find a stored credential",
        clarify: "the query is too vague to identify a stored credential",
        none: "the query is unrelated to finding a stored credential",
      },
    },
  };

  for (const candidate of candidates) {
    questions[candidate.token] = {
      type: "boolean",
      instructions:
        "Is this stored credential the one the user's query refers to?",
      criteria: {
        true: "the credential is what the query is asking for",
        false: "the credential is unrelated to the query",
      },
    };
  }

  return questions;
}

/** Reads P(true) from one answer, clamping to [0, 1]. Missing means no. */
export function readProbability(answer: unknown): number | undefined {
  if (!answer || typeof answer !== "object") return undefined;
  const typed = answer as { type?: unknown; probability?: unknown };
  if (typed.type !== "boolean") return undefined;
  if (typeof typed.probability !== "number" || !Number.isFinite(typed.probability)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, typed.probability));
}

export function readIntent(answer: unknown): SearchIntent | undefined {
  if (!answer || typeof answer !== "object") return undefined;
  const typed = answer as { type?: unknown; choice?: unknown };
  if (typed.type !== "choice" || typeof typed.choice !== "string") return undefined;
  return (SEARCH_INTENTS as readonly string[]).includes(typed.choice)
    ? (typed.choice as SearchIntent)
    : undefined;
}

export async function decideMatches({
  model,
  query,
  candidates,
  zeroDataRetention,
}: EvaluateArgs): Promise<EvaluateOutcome> {
  const result = await experimental_evaluate({
    model,
    state: buildEvaluationState(query, candidates),
    questions: buildEvaluationQuestions(candidates),
    providerOptions: privacyProviderOptions(zeroDataRetention),
  });

  const decisions = candidates.map((candidate) => ({
    token: candidate.token,
    // Core guarantees one answer per question, so this fallback only covers an
    // answer of an unexpected shape. Such a candidate scores zero and is
    // dropped rather than surfaced on a guess.
    probability: readProbability(result.answers[candidate.token]) ?? 0,
  }));

  return {
    intent: readIntent(result.answers[INTENT_QUESTION]),
    decisions,
  };
}

/**
 * Minimal round trip used to prove a saved evaluation provider works. The
 * statement is trivially true, so a healthy provider answers near 1.
 */
export async function probeEvaluationModel(
  model: EvaluationModel,
  zeroDataRetention: boolean,
): Promise<void> {
  await experimental_evaluate({
    model,
    state: "2 + 2 = 4.",
    questions: {
      reachable: {
        type: "boolean",
        instructions: "Is the statement in the state true?",
        criteria: {
          true: "the statement is true",
          false: "the statement is false",
        },
      },
    },
    providerOptions: privacyProviderOptions(zeroDataRetention),
  });
}
