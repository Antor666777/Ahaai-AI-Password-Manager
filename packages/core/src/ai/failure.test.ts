import { describe, expect, it } from "vitest";
import { providerFailureReason, upstreamFailure } from "./failure";

describe("providerFailureReason", () => {
  it("returns the provider message with its status", () => {
    const error = Object.assign(
      new Error("AI Gateway authentication failed: Invalid API key or token."),
      { statusCode: 401 },
    );

    expect(providerFailureReason(error)).toBe(
      "AI Gateway authentication failed: Invalid API key or token. (HTTP 401)",
    );
  });

  it("collapses whitespace and clips a long message", () => {
    const error = Object.assign(
      new Error(`line one\n\n   line two ${"x".repeat(400)}`),
      { statusCode: 400 },
    );

    const reason = providerFailureReason(error);
    expect(reason).toContain("line one line two");
    expect(reason?.endsWith("(HTTP 400)")).toBe(true);
    expect(reason?.length).toBeLessThanOrEqual(320);
  });

  it("accepts an error identified by a url or a response body", () => {
    expect(
      providerFailureReason(
        Object.assign(new Error("gateway said no"), {
          url: "https://ai-gateway.vercel.sh/v1",
        }),
      ),
    ).toBe("gateway said no");
    expect(
      providerFailureReason(
        Object.assign(new Error("gateway said no"), { responseBody: "{}" }),
      ),
    ).toBe("gateway said no");
  });

  it("ignores an ordinary bug so internals cannot leak through a 5xx", () => {
    expect(
      providerFailureReason(new TypeError("Cannot read properties of undefined")),
    ).toBeUndefined();
    expect(providerFailureReason(undefined)).toBeUndefined();
    expect(providerFailureReason("nope")).toBeUndefined();
    expect(
      providerFailureReason(Object.assign(new Error(""), { statusCode: 500 })),
    ).toBeUndefined();
  });
});

describe("upstreamFailure", () => {
  it("keeps the provider reason in the message", () => {
    const failure = upstreamFailure(
      "Could not reach the provider",
      Object.assign(new Error("Invalid API key"), { statusCode: 401 }),
    );

    expect(failure.code).toBe("UPSTREAM");
    expect(failure.status).toBe(502);
    expect(failure.message).toBe(
      "Could not reach the provider: Invalid API key (HTTP 401)",
    );
  });

  it("falls back to the base message for a non-provider error", () => {
    const failure = upstreamFailure("Could not reach the provider", new Error("boom"));
    expect(failure.message).toBe("Could not reach the provider");
  });
});
