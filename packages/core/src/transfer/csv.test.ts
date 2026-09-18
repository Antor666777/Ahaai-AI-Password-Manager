import { describe, expect, it } from "vitest";
import {
  cell,
  columnIndex,
  field,
  parseCsv,
  readCsv,
  serializeCsv,
} from "./csv";

describe("parseCsv", () => {
  it("splits a simple row", () => {
    expect(parseCsv("a,b,c")).toEqual([["a", "b", "c"]]);
  });

  it("keeps an embedded comma inside a quoted field", () => {
    expect(parseCsv('name,note\n"Acme, Inc.",ok')).toEqual([
      ["name", "note"],
      ["Acme, Inc.", "ok"],
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('a,"he said ""hi"""')).toEqual([["a", 'he said "hi"']]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('a,"line1\nline2"')).toEqual([["a", "line1\nline2"]]);
  });

  it("tolerates CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    expect(parseCsv("\uFEFFa,b")).toEqual([["a", "b"]]);
  });

  it("does not add an empty row for a trailing newline", () => {
    expect(parseCsv("a,b\n")).toHaveLength(1);
  });

  it("keeps a trailing empty field", () => {
    expect(parseCsv("a,")).toEqual([["a", ""]]);
  });
});

describe("serializeCsv", () => {
  it("quotes a field only when it needs it", () => {
    const csv = serializeCsv([
      ["a", "b,c"],
      ['x"y', "z\nw"],
    ]);
    expect(csv).toBe('a,"b,c"\r\n"x""y","z\nw"');
  });

  it("round-trips through parseCsv", () => {
    const rows = [["plain", "with,comma", 'with"quote', "with\nnewline", ""]];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });
});

describe("readCsv helpers", () => {
  it("trims the header and numbers records from the header", () => {
    const doc = readCsv(" name , age \nAda,36\nGrace,45");
    expect(doc.header).toEqual(["name", "age"]);
    expect(doc.rows.map((row) => row.line)).toEqual([2, 3]);
    expect(cell(doc.rows[0].cells, 0)).toBe("Ada");
  });

  it("looks up columns case-insensitively", () => {
    expect(columnIndex(["Name", "E-mail"], "e-mail")).toBe(1);
    expect(columnIndex(["Name"], "missing")).toBe(-1);
  });

  it("preserves whitespace in a data cell but trims a structural field", () => {
    const cells = ["  spaced  "];
    expect(cell(cells, 0)).toBe("  spaced  ");
    expect(field(cells, 0)).toBe("spaced");
  });

  it("returns empty text for a column past the end of the row", () => {
    expect(cell(["a"], 5)).toBe("");
  });
});
