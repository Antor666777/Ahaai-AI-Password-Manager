import { logger } from "@/lib/log";
import { AppError } from "@/lib/http/errors";
import { RATE_LIMITS, type RateLimitName } from "./limits";
import { MemoryRateLimiter } from "./memory";
import { createRedisRateLimiter } from "./redis";
import type { RateLimiter } from "./types";

let cached: RateLimiter | null = null;
let pending: Promise<RateLimiter> | null = null;

async function createLimiter(): Promise<RateLimiter> {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const limiter = await createRedisRateLimiter(url);
      logger.info("rate limiter: redis backend");
      return limiter;
    } catch (error) {
      // Loud on purpose: the in-memory fallback is per instance, so on a
      // multi-instance deployment the effective login limit multiplies by the
      // instance count. That is a real weakening, not a routine warning.
      logger.error(
        "rate limiter: redis unavailable, falling back to per-instance memory limits",
        { message: error instanceof Error ? error.message : String(error) },
      );
    }
  }
  logger.info("rate limiter: in-memory backend");
  return new MemoryRateLimiter();
}

export async function getRateLimiter(): Promise<RateLimiter> {
  if (cached) return cached;
  pending ??= createLimiter();
  cached = await pending;
  return cached;
}

export function resetRateLimiter(): void {
  cached = null;
  pending = null;
}

export interface RateLimitTarget {
  name: RateLimitName;
  identifier: string;
}

/**
 * Applies one or more named limits. Throws a 429 AppError when any is exceeded.
 */
export async function enforceRateLimits(
  targets: RateLimitTarget[],
): Promise<void> {
  const limiter = await getRateLimiter();

  for (const target of targets) {
    const rule = RATE_LIMITS[target.name];
    const result = await limiter.limit(
      `${target.name}:${target.identifier}`,
      rule,
    );

    if (!result.ok) {
      throw AppError.rateLimited("Too many requests", {
        retryAfterSeconds: result.retryAfterSeconds,
        resetAt: new Date(result.resetAt).toISOString(),
        limit: target.name,
      });
    }
  }
}

export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<void> {
  await enforceRateLimits([{ name, identifier }]);
}

export { MemoryRateLimiter } from "./memory";
export { RedisRateLimiter } from "./redis";
export type { RateLimitRule, RateLimitResult } from "./types";
export { RATE_LIMITS } from "./limits";
