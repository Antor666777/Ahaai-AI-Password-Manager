import { describe, expect, it } from "vitest";
import {
  MAX_CANDIDATES,
  MAX_MATCHES,
  buildSearchCandidates,
  isValidToken,
  mintToken,
  normalizeDomain,
  selectAllowedMatches,
} from "./tokenize";

describe("mintToken", () => {
  it("produces valid, unique, opaque tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const token = mintToken();
      expect(isValidToken(token)).toBe(true);
      tokens.add(token);
    }
    expect(tokens.size).toBe(1000);
  });

  it("rejects malformed tokens", () => {
    expect(isValidToken("")).toBe(false);
    expect(isValidToken("t_short")).toBe(false);
    expect(isValidToken("x_" + "a".repeat(22))).toBe(false);
    expect(isValidToken("t_" + "!".repeat(22))).toBe(false);
    expect(isValidToken(42)).toBe(false);
  });
});

describe("buildSearchCandidates", () => {
  it("maps each source to a unique token and back", () => {
    const { candidates, idByToken, tokenById } = buildSearchCandidates([
      { id: "id-1", title: "My Duolingo IDP", note: "main account" },
      { id: "id-2", title: "Youtube for grandpa", domain: "youtube.com" },
    ]);

    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      const id = idByToken.get(candidate.token);
      expect(id).toBeTruthy();
      expect(tokenById.get(id as string)).toBe(candidate.token);
    }
    expect(new Set(candidates.map((c) => c.token)).size).toBe(2);
  });

  it("sanitizes metadata and normalizes domains", () => {
    const { candidates } = buildSearchCandidates([
      {
        id: "id-1",
        title: "  spaced   out   title  ",
        note: "n".repeat(5000),
        domain: "https://WWW.Example.com/login?x=1",
      },
    ]);

    expect(candidates[0].title).toBe("spaced out title");
    expect(candidates[0].note).toHaveLength(1000);
    expect(candidates[0].domain).toBe("www.example.com");
  });

  it("caps the number of candidates", () => {
    const sources = Array.from({ length: MAX_CANDIDATES + 50 }, (_, i) => ({
      id: `id-${i}`,
      title: `Item ${i}`,
    }));
    expect(buildSearchCandidates(sources).candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("never includes a token derived from the item id", () => {
    const { candidates } = buildSearchCandidates([
      { id: "duolingo-alt", title: "Duolingo alt" },
    ]);
    expect(candidates[0].token).not.toContain("duolingo");
  });
});

describe("normalizeDomain", () => {
  it("handles bare hosts, full URLs and junk", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
    expect(normalizeDomain("https://a.b.example.co.uk/path")).toBe(
      "a.b.example.co.uk",
    );
    expect(normalizeDomain("")).toBeUndefined();
    expect(normalizeDomain(null)).toBeUndefined();
    expect(normalizeDomain("not a domain")).toBe("not a domain");
  });
});

describe("selectAllowedMatches", () => {
  const allowed = new Set([mintToken(), mintToken(), mintToken()]);
  const [t0, t1, t2] = Array.from(allowed);

  it("keeps only tokens that were actually sent", () => {
    const matches = selectAllowedMatches(allowed, [
      { token: t0, reason: "duolingo alt", score: 0.9 },
      { token: mintToken(), reason: "hallucinated", score: 0.99 },
      { token: "garbage", score: 0.5 },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].token).toBe(t0);
  });

  it("dedupes and clamps scores", () => {
    const matches = selectAllowedMatches(allowed, [
      { token: t1, score: 5 },
      { token: t1, score: 0.2 },
      { token: t2, score: -3 },
      { token: t0 },
    ]);
    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({ token: t1, score: 1 });
    expect(matches[1]).toMatchObject({ token: t2, score: 0 });
    expect(matches[2]).toMatchObject({ token: t0, score: 0.5 });
  });

  it("caps results and truncates reasons", () => {
    const many = Array.from(allowed).map((token) => ({
      token,
      reason: "r".repeat(1000),
    }));
    const matches = selectAllowedMatches(allowed, many, 2);
    expect(matches).toHaveLength(2);
    expect(matches[0].reason.length).toBeLessThanOrEqual(300);
  });

  it("never exceeds MAX_MATCHES by default", () => {
    const tokens = Array.from({ length: MAX_MATCHES + 10 }, () => mintToken());
    const matches = selectAllowedMatches(
      new Set(tokens),
      tokens.map((token) => ({ token })),
    );
    expect(matches).toHaveLength(MAX_MATCHES);
  });
});
