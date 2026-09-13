import { buildSessionCookie } from "@/lib/auth/cookies";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { getRequestContext } from "@/lib/auth/request-context";
import { registerSchema } from "@/lib/auth/schemas";
import { toPublicUser } from "@/lib/auth/serializers";
import { registerUser } from "@/lib/auth/service";
import { getDb } from "@/lib/db/client";
import { jsonCreated, jsonError } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { enforceRateLimits } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = getRequestContext(request);
    const ip = context.ip ?? "unknown";
    await enforceRateLimits([
      { name: "global", identifier: `ip:${ip}` },
      { name: "register", identifier: `ip:${ip}` },
    ]);

    const body = await parseJson(request, registerSchema);

    const result = await registerUser(getDb(), body, context);

    return jsonCreated(
      {
        user: toPublicUser(result.user),
        vault: {
          protectedVaultKey: result.user.protectedVaultKey,
          kdfParams: result.user.kdfParams,
        },
        expiresAt: result.expiresAt.toISOString(),
      },
      { headers: { "set-cookie": buildSessionCookie(result.token, result.ttlMs) } },
    );
  } catch (error) {
    return jsonError(error, { route: "auth/register" });
  }
}
