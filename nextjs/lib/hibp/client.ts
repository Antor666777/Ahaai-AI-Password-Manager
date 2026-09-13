import { getCache, type CacheStore } from "@/lib/cache";
import { AppError } from "@/lib/http/errors";

export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
export const PWNED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PWNED_PREFIX_RE = /^[0-9A-Fa-f]{5}$/;
const SUFFIX_LINE_RE = /^[0-9A-F]{35}:\d+$/i;

export function isValidPrefix(prefix: string): boolean {
  return PWNED_PREFIX_RE.test(prefix);
}

export interface PwnedRange {
  prefix: string;
  /** Raw `SUFFIX:COUNT` lines from the k-anonymity range API. */
  suffixes: string;
  cached: boolean;
}

export interface PwnedRangeDeps {
  fetchImpl?: typeof fetch;
  cache?: CacheStore;
  ttlMs?: number;
  userAgent?: string;
}

/**
 * Fetches the Pwned Passwords k-anonymity range for a 5-character SHA-1
 * prefix. Only the prefix leaves our infrastructure; the full hash and the
 * password itself never do. Results are cached to cut upstream traffic.
 */
export async function getPwnedRange(
  prefix: string,
  deps: PwnedRangeDeps = {},
): Promise<PwnedRange> {
  if (!isValidPrefix(prefix)) {
    throw AppError.badRequest("Prefix must be exactly 5 hex characters");
  }

  const normalized = prefix.toUpperCase();
  const cache = deps.cache ?? (await getCache());
  const cacheKey = `hibp:range:${normalized}`;

  const hit = await cache.get(cacheKey);
  if (hit !== null) {
    return { prefix: normalized, suffixes: hit, cached: true };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const userAgent =
    deps.userAgent ?? process.env.HIBP_USER_AGENT ?? "Ahaai-Password-Manager";

  let response: Response;
  try {
    response = await fetchImpl(`${HIBP_RANGE_URL}${normalized}`, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        "Add-Padding": "true",
      },
      cache: "no-store",
    });
  } catch (error) {
    throw AppError.upstream("Pwned Passwords is unreachable", error);
  }

  if (!response.ok) {
    throw AppError.upstream(`Pwned Passwords returned ${response.status}`);
  }

  const text = await response.text();
  const suffixes = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => SUFFIX_LINE_RE.test(line))
    .join("\n");

  await cache.set(cacheKey, suffixes, deps.ttlMs ?? PWNED_CACHE_TTL_MS);

  return { prefix: normalized, suffixes, cached: false };
}
