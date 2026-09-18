import { getCache, type CacheStore } from "@ahaai/core/cache";
import { AppError } from "@ahaai/core/http/errors";

export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
export const PWNED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PWNED_PREFIX_RE = /^[0-9A-Fa-f]{5}$/;
const SUFFIX_LINE_RE = /^[0-9A-F]{35}:\d+$/i;

/** Upper bound on a single batch: the vault-wide sweep is chunked to this. */
export const MAX_PWNED_BATCH = 200;
/** How many range requests may be in flight at once against the upstream. */
export const PWNED_BATCH_CONCURRENCY = 8;

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

/**
 * Fetches several k-anonymity ranges in one call, which is what makes a
 * vault-wide sweep possible: 400 logins could otherwise mean 400 requests, each
 * tripping the per-prefix rate limit.
 *
 * Every prefix is validated, duplicates are collapsed, and the set is capped at
 * {@link MAX_PWNED_BATCH}. Work fans out through a small pool so a large batch
 * cannot open hundreds of sockets at the upstream. Each range goes through
 * {@link getPwnedRange}, so the shared 24 h cache absorbs repeat prefixes.
 * One entry is returned per unique prefix, in first-seen order.
 */
export async function getPwnedRanges(
  deps: PwnedRangeDeps,
  prefixes: string[],
): Promise<PwnedRange[]> {
  for (const prefix of prefixes) {
    if (!isValidPrefix(prefix)) {
      throw AppError.badRequest("Prefix must be exactly 5 hex characters");
    }
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const prefix of prefixes) {
    const normalized = prefix.toUpperCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
    if (unique.length === MAX_PWNED_BATCH) break;
  }

  const results: PwnedRange[] = new Array<PwnedRange>(unique.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      if (index >= unique.length) return;
      next += 1;
      results[index] = await getPwnedRange(unique[index], deps);
    }
  }

  const workers = Array.from(
    { length: Math.min(PWNED_BATCH_CONCURRENCY, unique.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
