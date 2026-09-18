import { describe, expect, it } from "vitest";
import { readCsv } from "./csv";
import * as bitwarden from "./bitwarden";
import type { SkippedRow } from "./types";

// A faithful Bitwarden CSV export: the full login/card/identity header, a row
// whose notes hold a comma, a custom field, a secure note, a row with an
// embedded newline, and one row missing its name.
const CSV = [
  "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp,card_brand,card_holder_name,card_number,card_exp_month,card_exp_year,card_code,identity_first_name,identity_last_name,identity_email,identity_phone,identity_address1",
  '"Work",1,login,"GitHub","deploy key, rotated","PIN: 1234",0,"https://github.com","octocat","hunter2","JBSWY3DPEHPK3PXP"',
  '"Work",0,card,"Visa","","",0,,,,,"Visa","Ada Lovelace",4111111111111111,12,2028,123',
  ',0,note,"WiFi","ssid=corp; pass=letmein","",0',
  ',0,login,"Multi","first line\nsecond line","",0',
  ",0,login",
].join("\n");

function run(): { records: ReturnType<typeof bitwarden.parse>; skipped: SkippedRow[] } {
  const skipped: SkippedRow[] = [];
  const records = bitwarden.parse(readCsv(CSV), (row) => skipped.push(row));
  return { records, skipped };
}

describe("bitwarden mapper", () => {
  it("detects the header", () => {
    expect(bitwarden.detect(readCsv(CSV).header)).toBe(true);
  });

  it("maps logins, cards and secure notes", () => {
    const { records } = run();
    expect(records).toHaveLength(4);

    expect(records[0]).toMatchObject({
      type: "login",
      name: "GitHub",
      notes: "deploy key, rotated",
      folder: "Work",
      favorite: true,
      payload: {
        username: "octocat",
        password: "hunter2",
        totpSecret: "JBSWY3DPEHPK3PXP",
        urls: ["https://github.com"],
        custom: [{ label: "PIN", value: "1234" }],
      },
    });

    expect(records[1]).toMatchObject({
      type: "card",
      name: "Visa",
      favorite: false,
      payload: {
        brand: "Visa",
        holder: "Ada Lovelace",
        number: "4111111111111111",
        expiry: "12/2028",
        cvv: "123",
      },
    });

    expect(records[2].type).toBe("secure_note");
    expect(records[2].name).toBe("WiFi");
    expect(records[2].payload.body).toBe("ssid=corp; pass=letmein");
    expect(records[2].notes).toBeUndefined();
  });

  it("keeps a newline inside a quoted notes field", () => {
    const { records } = run();
    expect(records[3].notes).toBe("first line\nsecond line");
  });

  it("flags a row with no name instead of throwing", () => {
    const { records, skipped } = run();
    expect(records).toHaveLength(4);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ line: 6, reason: "Missing name" });
  });
});
