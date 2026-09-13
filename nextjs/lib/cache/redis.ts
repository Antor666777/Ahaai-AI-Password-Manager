import type { CacheStore } from "./types";

export async function createRedisCache(url: string): Promise<CacheStore> {
  const { default: Redis } = await import("ioredis");
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
  });

  return {
    async get(key) {
      return client.get(key);
    },
    async set(key, value, ttlMs) {
      await client.set(key, value, "PX", Math.max(1, Math.floor(ttlMs)));
    },
  };
}
