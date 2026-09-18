import { describe, expect, it } from "vitest";
import { readCsv } from "./csv";
import * as keepass from "./keepass";
import type { SkippedRow } from "./types";

const KEEPASSXC = [
  "Group,Title,Username,Password,URL,Notes,TOTP,Icon,Last Modified,Created",
  '"Email","Proton","ada","p@ss","https://proton.me","note, quoted",JBSWY3DPEHPK3PXP,0,"2026-01-01","2025-01-01"',
  '"Email","","bob","x","","",,0,"",""',
].join("\n");

const CLASSIC = [
  '"Account","Login Name","Password","Web Site","Comments"',
  '"Router","admin","secret","https://192.168.0.1","default login"',
  '"","nouser","nopass","",""',
].join("\n");

function run(csv: string) {
  const skipped: SkippedRow[] = [];
  const records = keepass.parse(readCsv(csv), (row) => skipped.push(row));
  return { records, skipped };
}

describe("keepass mapper", () => {
  it("detects both layout headers", () => {
    expect(keepass.detect(readCsv(KEEPASSXC).header)).toBe(true);
    expect(keepass.detect(readCsv(CLASSIC).header)).toBe(true);
  });

  it("maps the KeePassXC layout with its Group column", () => {
    const { records, skipped } = run(KEEPASSXC);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      type: "login",
      name: "Proton",
      notes: "note, quoted",
      folder: "Email",
      payload: {
        username: "ada",
        password: "p@ss",
        totpSecret: "JBSWY3DPEHPK3PXP",
        urls: ["https://proton.me"],
      },
    });
    expect(skipped[0]).toMatchObject({ line: 3, reason: "Missing title" });
  });

  it("maps the classic KeePass 2.x layout", () => {
    const { records, skipped } = run(CLASSIC);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      type: "login",
      name: "Router",
      notes: "default login",
      payload: {
        username: "admin",
        password: "secret",
        urls: ["https://192.168.0.1"],
      },
    });
    expect(records[0].folder).toBeUndefined();
    expect(skipped[0]).toMatchObject({
      line: 3,
      reason: "Missing account name",
    });
  });
});
