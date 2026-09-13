import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/request-context";
import { normalizeEmail } from "@/lib/auth/service";
import { DEFAULT_KDF_PARAMS, KDF_VERSION } from "@/lib/crypto/kdf";
import { bytesToBase64, utf8ToBytes } from "@/lib/crypto/encoding";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseQuery } from "@/lib/http/validate";
import { enforceRateLimits } from "@/lib/rate-limit";

const querySchema = z.object({ email: z.string().trim().min(3).max(254) });

/**
 * Returns the KDF parameters a client needs before it can derive its auth hash.
 * Unknown emails get a deterministic decoy so the endpoint cannot be used to
 * enumerate accounts.
 */
function decoySalt(email: string): string {
  const pepper = process.env.AUTH_PEPPER ?? "ahaai-prelogin-decoy";
  const digest = hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(`prelogin:${email}`));
  return bytesToBase64(digest.slice(0, 16));
}

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request) ?? "unknown";
    await enforceRateLimits([
      { name: "global", identifier: `ip:${ip}` },
      { name: "login", identifier: `ip:${ip}` },
    ]);

    const { email } = parseQuery(request, querySchema);
    const emailNormalized = normalizeEmail(email);

    const [user] = await getDb()
      .select({ kdfParams: users.kdfParams })
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);

    const kdfParams = user?.kdfParams ?? {
      ...DEFAULT_KDF_PARAMS,
      version: KDF_VERSION,
      salt: decoySalt(emailNormalized),
    };

    return jsonOk({ kdfParams });
  } catch (error) {
    return jsonError(error, { route: "auth/prelogin" });
  }
}
