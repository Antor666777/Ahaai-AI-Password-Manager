import { describe, expect, it } from "vitest";
import { mintToken } from "@ahaai/core/crypto/tokenize";
import {
  MAX_SHORTLIST,
  queryTerms,
  scoreCandidate,
  shortlistCandidates,
  type ShortlistInput,
} from "./shortlist";

function candidate(
  title: string,
  extra: Partial<ShortlistInput> = {},
): ShortlistInput {
  return { token: mintToken(), title, ...extra };
}

describe("queryTerms", () => {
  it("lowercases and splits on punctuation", () => {
    expect(queryTerms("My Duolingo Alt")).toEqual(["my", "duolingo", "alt"]);
    expect(queryTerms("bank, login!")).toEqual(["bank", "login"]);
  });

  it("drops single characters that would match almost anything", () => {
    expect(queryTerms("a b c")).toEqual([]);
  });
});

describe("scoreCandidate", () => {
  it("weights a domain hit above a title hit above a note hit", () => {
    const terms = ["duolingo"];
    const domain = scoreCandidate(
      terms,
      "duolingo",
      candidate("Anything", { domain: "duolingo.com" }),
    );
    const title = scoreCandidate(terms, "duolingo", candidate("Duolingo alt"));
    const note = scoreCandidate(
      terms,
      "duolingo",
      candidate("Anything", { note: "my duolingo" }),
    );

    expect(domain).toBeGreaterThan(title);
    expect(title).toBeGreaterThan(note);
    expect(note).toBeGreaterThan(0);
  });

  it("rewards a query that is exactly the domain", () => {
    const exact = scoreCandidate(
      ["example"],
      "example.com",
      candidate("Anything", { domain: "example.com" }),
    );
    const partial = scoreCandidate(
      ["example"],
      "example.com",
      candidate("Anything", { domain: "notexample.com" }),
    );
    expect(exact).toBeGreaterThan(partial);
  });

  it("prefers a whole title word over part of one", () => {
    expect(
      scoreCandidate(["duo"], "duo", candidate("Duo login")),
    ).toBeGreaterThan(scoreCandidate(["duo"], "duo", candidate("Duolingo")));
  });

  it("ignores case", () => {
    expect(
      scoreCandidate(["bank"], "BANK", candidate("BANK")),
    ).toBeGreaterThan(0);
  });
});

describe("shortlistCandidates", () => {
  it("returns the candidates untouched when the vault already fits", () => {
    const candidates = [candidate("One"), candidate("Two")];
    expect(shortlistCandidates("anything", candidates, 10)).toEqual(candidates);
  });

  it("puts the strongest lexical match first", () => {
    const others = Array.from({ length: MAX_SHORTLIST + 5 }, (_, index) =>
      candidate(`Filler ${index}`),
    );
    const target = candidate("Duolingo alt", { domain: "duolingo.com" });

    const result = shortlistCandidates(
      "duolingo",
      [...others, target],
      MAX_SHORTLIST,
    );

    expect(result[0]).toBe(target);
  });

  it("still fills the list when the query shares no wording", () => {
    const candidates = Array.from({ length: MAX_SHORTLIST + 5 }, (_, index) =>
      candidate(`Item ${index}`),
    );

    const result = shortlistCandidates(
      "the video site grandpa uses",
      candidates,
      5,
    );

    expect(result).toHaveLength(5);
    expect(result).toEqual(candidates.slice(0, 5));
  });

  it("never exceeds the cap", () => {
    const candidates = Array.from({ length: MAX_SHORTLIST + 20 }, () =>
      candidate("x"),
    );
    expect(shortlistCandidates("x", candidates)).toHaveLength(MAX_SHORTLIST);
  });

  it("breaks ties by vault order so a query is reproducible", () => {
    const candidates = Array.from({ length: MAX_SHORTLIST + 5 }, () =>
      candidate("Same"),
    );

    const first = shortlistCandidates("nomatchterm", candidates, 3);
    const second = shortlistCandidates("nomatchterm", candidates, 3);

    expect(first.map((entry) => entry.token)).toEqual(
      second.map((entry) => entry.token),
    );
    expect(first.map((entry) => entry.token)).toEqual(
      candidates.slice(0, 3).map((entry) => entry.token),
    );
  });
});
