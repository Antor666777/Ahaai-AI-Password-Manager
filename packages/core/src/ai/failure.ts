/**
 * A provider failure is written for whoever configured the credentials, so the
 * useful part of it is worth showing. It is surfaced only for errors that look
 * like they came from an HTTP call, which keeps an ordinary bug's message from
 * leaking through a 5xx.
 */
import { AppError } from "@ahaai/core/http/errors";

const MAX_REASON_CHARS = 300;

function read(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Provider messages carry a status, a URL, or a response body; bugs do not. */
function looksLikeProviderError(error: object): boolean {
  if (typeof read(error, "statusCode") === "number") return true;
  if (text(read(error, "url"))) return true;
  if (text(read(error, "responseBody"))) return true;
  return false;
}

/**
 * The provider's own explanation, collapsed and clipped, or `undefined` when the
 * error was not a provider response.
 */
export function providerFailureReason(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !looksLikeProviderError(error)) {
    return undefined;
  }

  const message = text(read(error, "message"));
  if (!message) return undefined;

  const collapsed = message.replace(/\s+/g, " ").trim();
  const clipped =
    collapsed.length > MAX_REASON_CHARS
      ? `${collapsed.slice(0, MAX_REASON_CHARS)}…`
      : collapsed;

  const status = read(error, "statusCode");
  return typeof status === "number" ? `${clipped} (HTTP ${status})` : clipped;
}

/**
 * An UPSTREAM error that keeps the provider's reason in the message. The reason
 * is what the operator needs to fix the credential, and a bare 5xx hides it.
 */
export function upstreamFailure(base: string, error: unknown): AppError {
  const reason = providerFailureReason(error);
  return AppError.upstream(reason ? `${base}: ${reason}` : base, error);
}
