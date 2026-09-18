import type { RateLimitRule } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  /** Coarse ceiling on all requests from one IP. */
  global: { points: 300, windowMs: MINUTE },
  register: { points: 5, windowMs: HOUR, blockMs: 60 * MINUTE },
  login: { points: 10, windowMs: MINUTE },
  loginPerEmail: { points: 5, windowMs: MINUTE, blockMs: 15 * MINUTE },
  passwordChange: { points: 10, windowMs: HOUR },
  vault: { points: 120, windowMs: MINUTE },
  aiSearch: { points: 30, windowMs: MINUTE },
  aiProviderTest: { points: 20, windowMs: MINUTE },
  pwned: { points: 60, windowMs: MINUTE },
  pwnedBatch: { points: 20, windowMs: MINUTE },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
