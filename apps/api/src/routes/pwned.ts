import { z } from "zod";
import type { Hono } from "hono";
import { getClientIp } from "@ahaai/core/auth/request-context";
import { getPwnedRange, getPwnedRanges } from "@ahaai/core/hibp/client";
import { pwnedRangesSchema } from "@ahaai/core/hibp/schemas";
import { jsonOk } from "@ahaai/core/http/responses";
import { parseJson, parseQuery } from "@ahaai/core/http/validate";
import { enforceRateLimit } from "@ahaai/core/rate-limit";
import type { AppEnv } from "../types";

const querySchema = z.object({
  prefix: z.string().regex(/^[0-9A-Fa-f]{5}$/, "Prefix must be 5 hex characters"),
});

export function registerPwnedRoutes(app: Hono<AppEnv>): void {
  app.get("/pwned/range", async (c) => {
    const { config, fetchImpl } = c.get("deps");
    const ip = getClientIp(c.req.raw, { trustProxy: config.trustProxy }) ?? "unknown";
    await enforceRateLimit("pwned", `ip:${ip}`);

    const { prefix } = parseQuery(c.req.raw, querySchema);
    const result = await getPwnedRange(prefix, {
      fetchImpl,
      userAgent: config.hibpUserAgent,
    });

    return jsonOk(result);
  });

  // Batch form for the health dashboard. Unauthenticated and k-anonymity
  // preserving, exactly like the GET above: only 5-character SHA-1 prefixes
  // travel here, so the full hash and the password itself never leave the
  // browser. The global per-IP ceiling already fronts this route; `pwnedBatch`
  // is the stricter, endpoint-specific rule on top of it.
  app.post("/pwned/range", async (c) => {
    const { config, fetchImpl } = c.get("deps");
    const ip = getClientIp(c.req.raw, { trustProxy: config.trustProxy }) ?? "unknown";
    await enforceRateLimit("pwnedBatch", `ip:${ip}`);

    const { prefixes } = await parseJson(c.req.raw, pwnedRangesSchema);
    const ranges = await getPwnedRanges(
      { fetchImpl, userAgent: config.hibpUserAgent },
      prefixes,
    );

    return jsonOk({ ranges });
  });
}
