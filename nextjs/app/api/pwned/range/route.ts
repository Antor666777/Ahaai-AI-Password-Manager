import { z } from "zod";
import { getClientIp } from "@/lib/auth/request-context";
import { getPwnedRange } from "@/lib/hibp/client";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseQuery } from "@/lib/http/validate";
import { enforceRateLimits } from "@/lib/rate-limit";

const querySchema = z.object({
  prefix: z.string().regex(/^[0-9A-Fa-f]{5}$/, "Prefix must be 5 hex characters"),
});

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request) ?? "unknown";
    await enforceRateLimits([
      { name: "global", identifier: `ip:${ip}` },
      { name: "pwned", identifier: `ip:${ip}` },
    ]);

    const { prefix } = parseQuery(request, querySchema);
    const result = await getPwnedRange(prefix);

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { route: "pwned/range" });
  }
}
