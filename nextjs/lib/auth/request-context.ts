export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  deviceName: string | null;
  deviceType: string | null;
}

const MAX_IP_CHARS = 64;
const MAX_UA_CHARS = 512;

/**
 * Forwarded headers are only worth anything when something in front sets them.
 * A directly reachable deployment lets any caller invent `x-forwarded-for` and
 * walk around the per-IP rate limits, so TRUST_PROXY=0 turns them off.
 * The Fetch Request API exposes no socket address, so the fallback is null.
 */
function forwardedHeadersTrusted(): boolean {
  return process.env.TRUST_PROXY !== "0";
}

export function getClientIp(request: Request): string | null {
  if (!forwardedHeadersTrusted()) return null;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, MAX_IP_CHARS);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp ? realIp.slice(0, MAX_IP_CHARS) : null;
}

export function getRequestContext(request: Request): RequestContext {
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent")?.slice(0, MAX_UA_CHARS) ?? null,
    deviceName: request.headers.get("x-device-name")?.slice(0, 120) ?? null,
    deviceType: request.headers.get("x-device-type")?.slice(0, 40) ?? "web",
  };
}
