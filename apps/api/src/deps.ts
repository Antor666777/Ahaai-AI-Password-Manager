import { createLogger } from "@ahaai/core/log";
import type { Database } from "@ahaai/db/types";
import type { Config } from "./config";
import type { Deps } from "./types";

export interface CreateDepsOptions {
  config: Config;
  db: Database;
  fetchImpl?: typeof fetch;
}

export function createDeps(options: CreateDepsOptions): Deps {
  return {
    config: options.config,
    db: options.db,
    logger: createLogger({ service: "ahaai-api" }),
    fetchImpl: options.fetchImpl ?? fetch,
  };
}
