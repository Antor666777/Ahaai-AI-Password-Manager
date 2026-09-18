import type { Hono } from "hono";
import type { Logger } from "@ahaai/core/log";
import { jsonOk } from "@ahaai/core/http/responses";
import { getRateLimiter, getRateLimiterStatus } from "@ahaai/core/rate-limit";
import { pingDatabase } from "@ahaai/db/health";
import type { AppEnv, DependencyCheck } from "../types";

const SERVICE_NAME = "ahaai-password-manager";
const SERVICE_VERSION = "0.1.0";
const STARTED_AT = Date.now();

async function runCheck(
  dependency: string,
  probe: () => Promise<void>,
  log: Logger,
): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await probe();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    // The reason goes to the log, not the body: this route is unauthenticated
    // and a driver error can name internal hosts and ports.
    log.error("health.check.failed", {
      dependency,
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "down", latencyMs: Date.now() - start };
  }
}

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  // Liveness: cheap and static, so it never fails because a dependency is
  // briefly unavailable and never gets a slow query on the hot path.
  app.get("/health", () =>
    jsonOk({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeMs: Date.now() - STARTED_AT,
      time: new Date().toISOString(),
    }),
  );

  // Readiness: actually touches the dependencies so an orchestrator stops
  // routing traffic when Postgres (or a configured Redis) is down.
  app.get("/health/ready", async (c) => {
    const { db, redisHealthProbe, logger } = c.get("deps");

    const checks: Record<string, DependencyCheck> = {
      database: await runCheck("database", () => pingDatabase(db), logger),
    };
    if (redisHealthProbe) {
      checks.redis = await runCheck("redis", redisHealthProbe, logger);
    }

    // Surface the selected rate-limit backend here too, so a silent Redis to
    // per-instance-memory fallback is visible to the operator, not just a boot line.
    await getRateLimiter();
    const rateLimiter = getRateLimiterStatus();

    const ready = Object.values(checks).every((check) => check.status === "up");

    return Response.json(
      {
        status: ready ? "ok" : "unavailable",
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        uptimeMs: Date.now() - STARTED_AT,
        checks,
        rateLimiter,
      },
      { status: ready ? 200 : 503 },
    );
  });
}
