import { describe, expect, it } from "vitest";
import { AppError } from "@ahaai/core/http/errors";
import { assertSafeBaseUrl } from "./url-guard";

describe("assertSafeBaseUrl", () => {
  it("allows public https endpoints", () => {
    expect(() =>
      assertSafeBaseUrl("https://api.openai.com/v1", false),
    ).not.toThrow();
    expect(() =>
      assertSafeBaseUrl("https://openrouter.ai/api/v1", false),
    ).not.toThrow();
  });

  it("blocks non-https for cloud providers", () => {
    expect(() => assertSafeBaseUrl("http://api.example.com", false)).toThrow(
      AppError,
    );
  });

  it("allows http loopback for local providers", () => {
    expect(() =>
      assertSafeBaseUrl("http://localhost:11434/v1", true),
    ).not.toThrow();
    expect(() =>
      assertSafeBaseUrl("http://127.0.0.1:1234/v1", true),
    ).not.toThrow();
  });

  it("blocks loopback and private ranges for cloud providers", () => {
    expect(() => assertSafeBaseUrl("https://localhost:11434/v1", false)).toThrow(
      AppError,
    );
    expect(() => assertSafeBaseUrl("https://127.0.0.1/v1", false)).toThrow(
      AppError,
    );
    expect(() => assertSafeBaseUrl("https://10.0.0.5/v1", false)).toThrow(
      AppError,
    );
    expect(() => assertSafeBaseUrl("https://192.168.1.10/v1", false)).toThrow(
      AppError,
    );
    expect(() => assertSafeBaseUrl("https://172.16.5.4/v1", false)).toThrow(
      AppError,
    );
  });

  it("blocks cloud metadata endpoints", () => {
    expect(() =>
      assertSafeBaseUrl("https://169.254.169.254/latest/meta-data", false),
    ).toThrow(AppError);
    expect(() =>
      assertSafeBaseUrl("https://metadata.google.internal/v1", false),
    ).toThrow(AppError);
  });

  it("rejects invalid URLs", () => {
    expect(() => assertSafeBaseUrl("not a url", false)).toThrow(AppError);
  });
});
