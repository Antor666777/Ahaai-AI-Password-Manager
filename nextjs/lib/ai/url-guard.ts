import { AppError } from "@/lib/http/errors";

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Guards against SSRF when a user supplies a custom provider base URL.
 * Local presets may target loopback/private addresses; everything else must be
 * public HTTPS.
 */
export function assertSafeBaseUrl(raw: string, isLocal: boolean): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw AppError.badRequest("Base URL is not a valid URL");
  }

  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw AppError.badRequest(
      isLocal
        ? "Local base URLs must use http or https"
        : "Base URL must use https",
    );
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(host) || host.endsWith(".internal")) {
    throw AppError.badRequest("Base URL host is not allowed");
  }

  if (!isLocal) {
    if (host === "localhost" || host === "::1" || host.endsWith(".local")) {
      throw AppError.badRequest(
        "Loopback base URLs require a local provider preset",
      );
    }
    if (isPrivateIpv4(host)) {
      throw AppError.badRequest(
        "Private base URLs require a local provider preset",
      );
    }
  }
}
