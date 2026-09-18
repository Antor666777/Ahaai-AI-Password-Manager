import type { Logger } from "@ahaai/core/log";
import type { Database } from "@ahaai/db/types";
import type { Config } from "./config";

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
}

export interface AppEnv {
  Variables: {
    deps: Deps;
  };
}
