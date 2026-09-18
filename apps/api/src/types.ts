import type { Logger } from "@ahaai/core/log";
import type { Database } from "@ahaai/db/types";
import type { Config } from "./config";

/**
 * The outcome of a single readiness dependency check. The failure detail is
 * deliberately not carried here: the route is unauthenticated, so the reason is
 * logged and only the status is returned.
 */
export interface DependencyCheck {
  status: "up" | "down";
  latencyMs: number;
}

/**
 * Everything the app needs from the outside world. A different runtime (D1 and
 * KV on Workers, for example) supplies different implementations without any
 * change to route or service code.
 */
export interface Deps {
  config: Config;
  db: Database;
  logger: Logger;
  fetchImpl: typeof fetch;
  /**
   * Optional Redis probe, present only when REDIS_URL is configured. Resolves
   * when Redis answers PING and rejects when it does not; the readiness route
   * checks it as a dependency.
   */
  redisHealthProbe?: () => Promise<void>;
}

export interface AppEnv {
  Variables: {
    deps: Deps;
  };
}
