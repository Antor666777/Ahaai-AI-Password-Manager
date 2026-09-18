import { describe, expect, it } from "vitest";
import { detectFormat, parseImport, toBitwardenCsv, toGenericCsv } from "./index";
import { readCsv } from "./csv";
import { TransferError, type TransferRecord } from "./types";

const BITWARDEN = [
  "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp,card_brand,card_holder_name,card_number,card_exp_month,card_exp_year,card_code",
  '"Work",1,login,"GitHub","deploy key, rotated","PIN: 1234",0,"https://github.com","octocat","hunter2","JBSWY3DPEHPK3PXP"',
  ",0,login",
].join("\n");

const LASTPASS = [
  "url,username,password,totp,extra,name,grouping,fav",
  "https://example.com,ada,pw,,,Example,Personal,0",
].join("\n");

const ONEPASSWORD = [
  "Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes",
  "Example,https://example.com,ada,pw,,,,,,",
].join("\n");

const KEEPASS = [
  '"Account","Login Name","Password","Web Site","Comments"',
  '"Router","admin","secret","https://x.y","note"',
].join("\n");

describe("parseImport auto-detection", () => {
  it("detects each vendor from the header", () => {
    expect(detectFormat(readCsv(BITWARDEN).header)).toBe("bitwarden");
    expect(detectFormat(readCsv(LASTPASS).header)).toBe("lastpass");
    expect(detectFormat(readCsv(ONEPASSWORD).header)).toBe("onepassword");
    expect(detectFormat(readCsv(KEEPASS).header)).toBe("keepass");

    expect(parseImport(BITWARDEN).format).toBe("bitwarden");
    expect(parseImport(LASTPASS).format).toBe("lastpass");
    expect(parseImport(ONEPASSWORD).format).toBe("onepassword");
    expect(parseImport(KEEPASS).format).toBe("keepass");
  });

  it("collects skipped rows and keeps the good ones", () => {
    const result = parseImport(BITWARDEN);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].line).toBe(3);
  });

  it("falls back to generic for an unknown header with a name column", () => {
    const result = parseImport("name,value\nAlpha,1");
    expect(result.format).toBe("generic");
    expect(result.records[0]).toMatchObject({ type: "login", name: "Alpha" });
  });

  it("honours an explicit format", () => {
    expect(parseImport(LASTPASS, "lastpass").format).toBe("lastpass");
    expect(parseImport(LASTPASS, "generic").format).toBe("generic");
  });

  it("throws on an empty file", () => {
    expect(() => parseImport("")).toThrow(TransferError);
  });

  it("throws when no column looks like a name", () => {
    expect(() => parseImport("a,b\n1,2")).toThrow(TransferError);
  });
});

const RECORDS: TransferRecord[] = [
  {
    type: "login",
    name: "GitHub",
    notes: "work",
    folder: "Dev",
    favorite: true,
    payload: {
      username: "octocat",
      password: "hunter2",
      totpSecret: "JBSWY3DPEHPK3PXP",
      urls: ["https://github.com", "https://gist.github.com"],
    },
  },
  {
    type: "card",
    name: "Visa",
    favorite: false,
    payload: {
      holder: "Ada Lovelace",
      number: "4111111111111111",
      expiry: "12/2028",
      cvv: "123",
      brand: "Visa",
    },
  },
  {
    type: "identity",
    name: "Me",
    favorite: false,
    payload: {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555",
      address: "1 Analytical Way",
    },
  },
  {
    type: "secure_note",
    name: "WiFi",
    favorite: false,
    payload: { body: "ssid=corp; pass=letmein" },
  },
];

describe("generic CSV export", () => {
  it("round-trips through parseImport", () => {
    const result = parseImport(toGenericCsv(RECORDS));
    expect(result.format).toBe("generic");
    expect(result.skipped).toHaveLength(0);
    expect(result.records).toEqual(RECORDS);
  });
});

describe("bitwarden CSV export", () => {
  it("round-trips every item type, including custom fields", () => {
    const withCustom: TransferRecord[] = [
      {
        ...RECORDS[0],
        payload: {
          ...RECORDS[0].payload,
          custom: [{ label: "PIN", value: "1234" }],
        },
      },
      ...RECORDS.slice(1),
    ];
    const result = parseImport(toBitwardenCsv(withCustom));
    expect(result.format).toBe("bitwarden");
    expect(result.skipped).toHaveLength(0);
    expect(result.records).toEqual(withCustom);
  });
});
