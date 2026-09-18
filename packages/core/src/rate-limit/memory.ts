import {
  rateLimitedResult,
  type RateLimiter,
  type RateLimitResult,
  type RateLimitRule,
} from "./types";

const DEFAULT_MAX_KEYS = 10_000;

/**
 * In-process sliding-window limiter. Used when Redis is not configured, so
 * limits are per-instance rather than global.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly blocks = new Map<string, number>();

  constructor(private readonly maxKeys: number = DEFAULT_MAX_KEYS) {}

  async limit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();

    const blockedUntil = this.blocks.get(key);
    if (blockedUntil !== undefined) {
      if (blockedUntil > now) return rateLimitedResult(blockedUntil, now, rule.points);
      this.blocks.delete(key);
    }

    const windowStart = now - rule.windowMs;
    const previous = this.hits.get(key) ?? [];
    const recent = previous.filter((timestamp) => timestamp > windowStart);

    if (recent.length >= rule.points) {
      const resetAt = (recent[0] ?? now) + rule.windowMs;
      if (rule.blockMs && rule.blockMs > 0) {
        const until = now + rule.blockMs;
        this.blocks.set(key, until);
        return rateLimitedResult(until, now, rule.points);
      }
      return rateLimitedResult(resetAt, now, rule.points);
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.evictOverflow();

    return {
      ok: true,
      limit: rule.points,
      remaining: Math.max(0, rule.points - recent.length),
      resetAt: (recent[0] ?? now) + rule.windowMs,
      retryAfterSeconds: 0,
    };
  }

  private evictOverflow(): void {
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  reset(): void {
    this.hits.clear();
    this.blocks.clear();
  }
}
