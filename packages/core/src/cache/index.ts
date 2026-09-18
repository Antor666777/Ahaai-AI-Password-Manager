import { logger } from "@ahaai/core/log";
import { MemoryCache } from "./memory";
import { createRedisCache } from "./redis";
import type { CacheStore } from "./types";

export type { CacheStore } from "./types";
export { MemoryCache } from "./memory";

let cached: CacheStore | null = null;
let pending: Promise<CacheStore> | null = null;

async function createCache(): Promise<CacheStore> {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      return await createRedisCache(url);
    } catch (error) {
      logger.warn("cache: redis unavailable, falling back to memory", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return new MemoryCache();
}

export async function getCache(): Promise<CacheStore> {
  if (cached) return cached;
  pending ??= createCache();
  cached = await pending;
  return cached;
}

export function resetCache(): void {
  cached = null;
  pending = null;
}
