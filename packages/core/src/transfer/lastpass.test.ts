import { describe, expect, it } from "vitest";
import { readCsv } from "./csv";
import * as lastpass from "./lastpass";
import type { SkippedRow } from "./types";

const CSV = [
  "url,username,password,totp,extra,name,grouping,fav",
  'https://example.com,ada@example.com,"p@ss,word",JBSWY3DPEHPK3PXP,"a note, with comma",Example,Personal,1',
  "https://github.com,octocat,secret,,,GitHub,Work\\Social,0",
  "https://broken.example,bob,bobpass,,,,,0",
].join("\n");

function run() {
  const skipped: SkippedRow[] = [];
  const records = lastpass.parse(readCsv(CSV), (row) => skipped.push(row));
  return { records, skipped };
}

describe("lastpass mapper", () => {
  it("detects the header", () => {
    expect(lastpass.detect(readCsv(CSV).header)).toBe(true);
  });

  it("maps a login with an embedded comma and a folder", () => {
    const { records } = run();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: "login",
      name: "Example",
      notes: "a note, with comma",
      folder: "Personal",
      favorite: true,
      payload: {
        username: "ada@example.com",
        password: "p@ss,word",
        totpSecret: "JBSWY3DPEHPK3PXP",
        urls: ["https://example.com"],
      },
    });
  });

  it("keeps the nested grouping value verbatim", () => {
    const { records } = run();
    expect(records[1].folder).toBe("Work\\Social");
  });

  it("flags a login with no name", () => {
    const { skipped } = run();
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ line: 4, reason: "Missing name" });
  });
});
