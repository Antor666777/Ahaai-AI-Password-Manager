import { z } from "zod";
import type { Hono } from "hono";
import { getClientIp } from "@ahaai/core/auth/request-context";
import { getPwnedRange } from "@ahaai/core/hibp/client";
import { jsonOk } from "@ahaai/core/http/responses";
import { parseQuery } from "@ahaai/core/http/validate";
import { enforceRateLimits } from "@ahaai/core/rate-limit";
import type { AppEnv } from "../types";

const querySchema = z.object({
  prefix: z.string().regex(/^[0-9A-Fa-f]{5}$/, "Prefix must be 5 hex characters"),
});

export function registerPwnedRoutes(app: Hono<AppEnv>): void {
  app.get("/pwned/range", async (c) => {
    const { config, fetchImpl } = c.get("deps");
    const ip = getClientIp(c.req.raw) ?? "unknown";
    await enforceRateLimits([
      { name: "global", identifier: `ip:${ip}` },
      { name: "pwned", identifier: `ip:${ip}` },
    ]);

    const { prefix } = parseQuery(c.req.raw, querySchema);
    const result = await getPwnedRange(prefix, {
      fetchImpl,
      userAgent: config.hibpUserAgent,
    });

    return jsonOk(result);
  });
}
