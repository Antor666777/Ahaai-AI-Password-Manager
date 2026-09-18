import {
  rateLimitedResult,
  type RateLimiter,
  type RateLimitResult,
  type RateLimitRule,
} from "./types";

export interface WindowStore {
  /** Atomically records a hit and returns the count within the window. */
  hit(input: {
    key: string;
    now: number;
    windowMs: number;
    limit: number;
  }): Promise<{ allowed: boolean; count: number; resetAt: number }>;
  getBlock(key: string): Promise<number | null>;
  setBlock(key: string, ms: number): Promise<void>;
}

/**
 * Sliding-window limiter backed by an atomic store (Redis). The store is
 * injected so the limiter logic can be tested without a Redis server.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly store: WindowStore) {}

  async limit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();

    const blockedUntil = await this.store.getBlock(key);
    if (blockedUntil !== null) {
      if (blockedUntil > now) return rateLimitedResult(blockedUntil, now, rule.points);
    }

    const { allowed, count, resetAt } = await this.store.hit({
      key,
      now,
      windowMs: rule.windowMs,
      limit: rule.points,
    });

    if (!allowed) {
      if (rule.blockMs && rule.blockMs > 0) {
        const until = now + rule.blockMs;
        await this.store.setBlock(key, rule.blockMs);
        return rateLimitedResult(until, now, rule.points);
      }
      return rateLimitedResult(resetAt, now, rule.points);
    }

    return {
      ok: true,
      limit: rule.points,
      remaining: Math.max(0, rule.points - count),
      resetAt,
      retryAfterSeconds: 0,
    };
  }
}

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now + windowMs
  if oldest[2] then resetAt = tonumber(oldest[2]) + windowMs end
  return {0, count, resetAt}
end
redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
redis.call('PEXPIRE', key, windowMs)
return {1, count + 1, now + windowMs}
`;

export async function createRedisRateLimiter(url: string): Promise<RateLimiter> {
  const { default: Redis } = await import("ioredis");
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableOfflineQueue: true,
  });

  const store: WindowStore = {
    async hit({ key, now, windowMs, limit }) {
      const raw = (await client.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(now),
        String(windowMs),
        String(limit),
      )) as [number, number, number];

      const [allowedFlag, count, resetAt] = raw;
      return {
        allowed: Number(allowedFlag) === 1,
        count: Number(count),
        resetAt: Number(resetAt),
      };
    },
    async getBlock(key) {
      const value = await client.get(`${key}:block`);
      return value === null ? null : Number(value);
    },
    async setBlock(key, ms) {
      await client.set(`${key}:block`, String(Date.now() + ms), "PX", ms);
    },
  };

  return new RedisRateLimiter(store);
}

/**
 * A one-shot health probe for the Redis backend: connects, sends PING and tears
 * the connection down. Resolves when Redis answers and rejects otherwise, so the
 * readiness route can report the dependency without owning a client.
 */
export function createRedisPing(url: string): () => Promise<void> {
  return async () => {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
    });
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  };
}
