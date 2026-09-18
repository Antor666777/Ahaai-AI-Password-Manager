import { describe, expect, it } from "vitest";
import { readCsv } from "./csv";
import * as onepassword from "./onepassword";
import type { SkippedRow } from "./types";

const CSV = [
  "Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes",
  'Example,"https://example.com",ada@example.com,"p@ss,word","otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP",true,false,work,"line one\nline two"',
  "GitHub,https://github.com,octocat,hunter2,,false,false,,",
  ",,nouser,nopass,,,,,",
].join("\n");

function run() {
  const skipped: SkippedRow[] = [];
  const records = onepassword.parse(readCsv(CSV), (row) => skipped.push(row));
  return { records, skipped };
}

describe("onepassword mapper", () => {
  it("detects the header", () => {
    expect(onepassword.detect(readCsv(CSV).header)).toBe(true);
  });

  it("maps logins and keeps an exchange URI and a multiline note", () => {
    const { records } = run();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      type: "login",
      name: "Example",
      notes: "line one\nline two",
      favorite: true,
      payload: {
        username: "ada@example.com",
        password: "p@ss,word",
        totpSecret: "otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP",
        urls: ["https://example.com"],
      },
    });
    expect(records[1].favorite).toBe(false);
    expect(records[1].payload.totpSecret).toBeUndefined();
  });

  it("flags a row with no title", () => {
    const { skipped } = run();
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ line: 4, reason: "Missing title" });
  });
});
