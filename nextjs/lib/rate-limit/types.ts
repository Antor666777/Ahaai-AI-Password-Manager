export interface RateLimitRule {
  /** Maximum number of requests allowed within the window. */
  points: number;
  windowMs: number;
  /** When exceeded, block the key for this long (progressive lockout). */
  blockMs?: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms at which the caller may retry. */
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  limit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

export function rateLimitedResult(
  resetAt: number,
  now: number,
  limit: number,
): RateLimitResult {
  return {
    ok: false,
    limit,
    remaining: 0,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}
