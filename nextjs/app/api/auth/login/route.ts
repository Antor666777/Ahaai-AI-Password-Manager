import { buildSessionCookie } from "@/lib/auth/cookies";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { getRequestContext } from "@/lib/auth/request-context";
import { loginSchema } from "@/lib/auth/schemas";
import { toPublicUser } from "@/lib/auth/serializers";
import { loginUser, normalizeEmail } from "@/lib/auth/service";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseJson } from "@/lib/http/validate";
import { enforceRateLimit, enforceRateLimits } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = getRequestContext(request);
    const ip = context.ip ?? "unknown";
    await enforceRateLimits([
      { name: "global", identifier: `ip:${ip}` },
      { name: "login", identifier: `ip:${ip}` },
    ]);

    const body = await parseJson(request, loginSchema);
    await enforceRateLimit("loginPerEmail", `email:${normalizeEmail(body.email)}`);

    const result = await loginUser(getDb(), body, context);

    if (result.status !== "ok") {
      // Generic message: never reveal whether the account exists.
      throw AppError.unauthorized("Invalid email or master password");
    }

    return jsonOk(
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
    return jsonError(error, { route: "auth/login" });
  }
}
