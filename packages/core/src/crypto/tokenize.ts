import { bytesToBase64Url, randomBytes } from "./encoding";

export const TOKEN_PREFIX = "t_";
const TOKEN_BYTES = 16;
const TOKEN_RE = /^t_[A-Za-z0-9_-]{22}$/;

export const MAX_CANDIDATES = 500;
export const MAX_TITLE_CHARS = 200;
export const MAX_NOTE_CHARS = 1000;
export const MAX_DOMAIN_CHARS = 253;
export const MAX_REASON_CHARS = 300;
export const MAX_MATCHES = 25;

/**
 * Mints a fresh, request-scoped token. Tokens are never derived from an item
 * ID and are never persisted: they exist only for the lifetime of one search
 * request so the AI never sees a real credential identifier.
 */
export function mintToken(): string {
  return TOKEN_PREFIX + bytesToBase64Url(randomBytes(TOKEN_BYTES));
}

export function isValidToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export interface SearchCandidate {
  token: string;
  title: string;
  note?: string;
  domain?: string;
}

export interface CandidateSource {
  id: string;
  title: string;
  note?: string | null;
  domain?: string | null;
}

export interface CandidateSet {
  candidates: SearchCandidate[];
  /** token -> local item id (stays on the client) */
  idByToken: Map<string, string>;
  tokenById: Map<string, string>;
}

export function clampText(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

export function normalizeDomain(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return undefined;

  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const hostname = new URL(withScheme).hostname;
    return hostname.length > 0 ? hostname : undefined;
  } catch {
    return clampText(trimmed, MAX_DOMAIN_CHARS);
  }
}

/**
 * Builds the tokenized candidate list the AI is allowed to see. Titles, notes
 * and domains are the only item metadata that leaves the device; usernames and
 * passwords never appear here.
 */
export function buildSearchCandidates(sources: CandidateSource[]): CandidateSet {
  const candidates: SearchCandidate[] = [];
  const idByToken = new Map<string, string>();
  const tokenById = new Map<string, string>();

  for (const source of sources.slice(0, MAX_CANDIDATES)) {
    let token = mintToken();
    while (idByToken.has(token)) token = mintToken();

    const candidate: SearchCandidate = {
      token,
      title: clampText(source.title, MAX_TITLE_CHARS),
    };
    const note = source.note ? clampText(source.note, MAX_NOTE_CHARS) : "";
    if (note.length > 0) candidate.note = note;
    const domain = normalizeDomain(source.domain);
    if (domain) candidate.domain = domain;

    candidates.push(candidate);
    idByToken.set(token, source.id);
    tokenById.set(source.id, token);
  }

  return { candidates, idByToken, tokenById };
}

export interface RawMatch {
  token: unknown;
  reason?: unknown;
  score?: unknown;
}

export interface AllowedMatch {
  token: string;
  reason: string;
  score: number;
}

/**
 * Whitelists model output against the tokens we actually sent. This drops
 * hallucinated or injected tokens, dedupes, clamps scores, and caps the result.
 */
export function selectAllowedMatches(
  allowedTokens: Iterable<string>,
  matches: RawMatch[],
  max = MAX_MATCHES,
): AllowedMatch[] {
  const allowed = allowedTokens instanceof Set ? allowedTokens : new Set(allowedTokens);
  const seen = new Set<string>();
  const result: AllowedMatch[] = [];

  for (const match of matches) {
    if (result.length >= max) break;
    const token = match.token;
    if (!isValidToken(token) || !allowed.has(token) || seen.has(token)) continue;

    const numericScore = typeof match.score === "number" ? match.score : Number.NaN;
    const score = Number.isFinite(numericScore)
      ? Math.min(1, Math.max(0, numericScore))
      : 0.5;

    seen.add(token);
    result.push({
      token,
      reason:
        typeof match.reason === "string"
          ? clampText(match.reason, MAX_REASON_CHARS)
          : "",
      score,
    });
  }

  return result;
}
