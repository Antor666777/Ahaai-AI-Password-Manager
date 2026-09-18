/**
 * Deterministic pre-filter for AI search.
 *
 * The decision model answers one typed question per candidate, so the set it
 * sees has to stay bounded. This narrows a large vault to a short list using
 * nothing but the candidate's own non-secret metadata — no model, no network,
 * and no credential ever read or produced here.
 */

export const MAX_SHORTLIST = 25;

export interface ShortlistInput {
  token: string;
  title: string;
  note?: string;
  domain?: string;
}

export const SHORTLIST_WEIGHTS = {
  /** The whole query is exactly this candidate's domain. */
  domainExact: 4,
  /** A query term appears anywhere in the domain — the strongest lookup signal. */
  domainMatch: 3,
  /** A query term is a whole word in the title. */
  titleWord: 2,
  /** A query term is only part of a title word. */
  titleSubstring: 1.5,
  /** A query term appears in the note. */
  noteMatch: 1,
} as const;

const WORD_CHAR = /[a-z0-9]/;

/**
 * Splits a query into terms. Single characters are dropped: they match almost
 * everything and would carry no ranking signal.
 */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);
}

/** Whether `word` appears in `haystack` on its own, not inside a longer word. */
function hasWord(haystack: string, word: string): boolean {
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(word, from);
    if (index === -1) return false;
    const before = index === 0 ? "" : haystack[index - 1];
    const after =
      index + word.length >= haystack.length ? "" : haystack[index + word.length];
    // An empty string never matches WORD_CHAR, so the edges count as boundaries.
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    from = index + 1;
  }
}

export function scoreCandidate(
  terms: string[],
  query: string,
  candidate: ShortlistInput,
): number {
  const title = candidate.title.toLowerCase();
  const note = (candidate.note ?? "").toLowerCase();
  const domain = (candidate.domain ?? "").toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  let score = 0;
  if (domain.length > 0 && normalizedQuery.length > 0 && normalizedQuery === domain) {
    score += SHORTLIST_WEIGHTS.domainExact;
  }

  for (const term of terms) {
    if (domain.includes(term)) score += SHORTLIST_WEIGHTS.domainMatch;
    if (title.includes(term)) {
      score += hasWord(title, term)
        ? SHORTLIST_WEIGHTS.titleWord
        : SHORTLIST_WEIGHTS.titleSubstring;
    }
    if (note.length > 0 && note.includes(term)) {
      score += SHORTLIST_WEIGHTS.noteMatch;
    }
  }

  return score;
}

/**
 * Orders candidates by lexical relevance and keeps at most `max`.
 *
 * Ordered by score, but never truncated to only the matches: a query can
 * describe an item with no shared wording ("the video site grandpa uses"), so
 * the remaining candidates pad the list in vault order. The decision model then
 * filters that padding out on meaning rather than on spelling.
 */
export function shortlistCandidates<T extends ShortlistInput>(
  query: string,
  candidates: readonly T[],
  max: number = MAX_SHORTLIST,
): T[] {
  if (candidates.length <= max) return [...candidates];

  const terms = queryTerms(query);
  if (terms.length === 0) return candidates.slice(0, max);

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidate(terms, query, candidate),
    }))
    // The original index breaks ties, so the same query always yields the same
    // shortlist instead of depending on how the sort happened to land.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .map((entry) => entry.candidate);
}
