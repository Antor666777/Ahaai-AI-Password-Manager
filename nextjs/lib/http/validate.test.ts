import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "./errors";
import { parseJson, parseQuery } from "./validate";

const schema = z.object({ email: z.string().email(), age: z.number().int() });

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("parseJson", () => {
  it("returns parsed data for valid input", async () => {
    const data = await parseJson(jsonRequest({ email: "a@b.com", age: 3 }), schema);
    expect(data).toEqual({ email: "a@b.com", age: 3 });
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{not json",
    });
    await expect(parseJson(request, schema)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("rejects schema violations with details", async () => {
    let caught: unknown;
    try {
      await parseJson(jsonRequest({ email: "not-an-email", age: 1.5 }), schema);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe("BAD_REQUEST");
    expect(Array.isArray(appError.details)).toBe(true);
  });

  it("treats an empty body as an empty object", async () => {
    const request = new Request("http://localhost/api/test", { method: "POST" });
    await expect(parseJson(request, schema)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("parseQuery", () => {
  it("parses query string values", () => {
    const request = new Request("http://localhost/api/test?limit=25&cursor=abc");
    const result = parseQuery(
      request,
      z.object({ limit: z.coerce.number().int(), cursor: z.string().optional() }),
    );
    expect(result).toEqual({ limit: 25, cursor: "abc" });
  });

  it("rejects invalid query parameters", () => {
    const request = new Request("http://localhost/api/test?limit=not-a-number");
    expect(() =>
      parseQuery(request, z.object({ limit: z.coerce.number().int() })),
    ).toThrow(AppError);
  });
});
