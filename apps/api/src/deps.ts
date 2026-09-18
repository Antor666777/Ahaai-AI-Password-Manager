import { createLogger } from "@ahaai/core/log";
import { createRedisPing } from "@ahaai/core/rate-limit";
import type { Database } from "@ahaai/db/types";
import type { Config } from "./config";
import type { Deps } from "./types";

export interface CreateDepsOptions {
  config: Config;
  db: Database;
  fetchImpl?: typeof fetch;
  /** Injected in tests; otherwise derived from REDIS_URL when it is set. */
  redisHealthProbe?: () => Promise<void>;
}

export function createDeps(options: CreateDepsOptions): Deps {
  const redisUrl = process.env.REDIS_URL;
  return {
    config: options.config,
    db: options.db,
    logger: createLogger({ service: "ahaai-api" }),
    fetchImpl: options.fetchImpl ?? fetch,
    redisHealthProbe:
      options.redisHealthProbe ??
      (redisUrl ? createRedisPing(redisUrl) : undefined),
  };
}
