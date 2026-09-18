import { logger, type Logger } from "@ahaai/core/log";
import { AppError } from "@ahaai/core/http/errors";
import { RATE_LIMITS, type RateLimitName } from "./limits";
import { MemoryRateLimiter } from "./memory";
import { createRedisRateLimiter } from "./redis";
import type { RateLimiter } from "./types";

export type RateLimiterBackend = "redis" | "memory";

export interface RateLimiterStatus {
  backend: RateLimiterBackend;
  /** Redis was configured but unreachable, so limits are per instance. */
  degraded: boolean;
  /** The failure that forced the fallback, when degraded. */
  reason?: string;
}

let cached: RateLimiter | null = null;
let pending: Promise<RateLimiter> | null = null;
let status: RateLimiterStatus | null = null;

async function createLimiter(): Promise<RateLimiter> {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const limiter = await createRedisRateLimiter(url);
      logger.info("rate limiter: redis backend");
      status = { backend: "redis", degraded: false };
      return limiter;
    } catch (error) {
      // Loud on purpose: the in-memory fallback is per instance, so on a
      // multi-instance deployment the effective login limit multiplies by the
      // instance count. That is a real weakening, not a routine warning, so it
      // is also surfaced through getRateLimiterStatus() and /health/ready.
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(
        "rate limiter degraded: redis unavailable, falling back to per-instance memory limits",
        { message: reason },
      );
      status = { backend: "memory", degraded: true, reason };
      return new MemoryRateLimiter();
    }
  }
  logger.info("rate limiter: in-memory backend");
  status = { backend: "memory", degraded: false };
  return new MemoryRateLimiter();
}

export async function getRateLimiter(): Promise<RateLimiter> {
  if (cached) return cached;
  pending ??= createLimiter();
  cached = await pending;
  return cached;
}

/**
 * The selected backend and whether a Redis fallback weakened the limits. Null
 * until the limiter has been initialised for the first time.
 */
export function getRateLimiterStatus(): RateLimiterStatus | null {
  return status;
}

/**
 * Initialises the limiter (if needed) and logs the selected backend, so a
 * silent Redis fallback is loud at boot as well as in the readiness probe.
 */
export async function reportRateLimiterBackend(
  log: Logger = logger,
): Promise<RateLimiterStatus> {
  await getRateLimiter();
  const current = status ?? { backend: "memory", degraded: false };
  if (current.degraded) {
    log.error("rate limiter degraded to per-instance memory limits", {
      backend: current.backend,
      reason: current.reason,
    });
  } else {
    log.info("rate limiter backend selected", { backend: current.backend });
  }
  return current;
}

export function resetRateLimiter(): void {
  cached = null;
  pending = null;
  status = null;
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
export { RedisRateLimiter, createRedisPing } from "./redis";
export type { RateLimitRule, RateLimitResult } from "./types";
export { RATE_LIMITS } from "./limits";
