import { ZodError } from "zod";
import { logger } from "@ahaai/core/log";
import { AppError } from "./errors";

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 201, ...init });
}

export function jsonError(error: unknown, context?: Record<string, unknown>): Response {
  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error("request failed", {
        code: error.code,
        message: error.message,
        ...context,
      });
    }

    const headers: Record<string, string> = {};
    if (error.code === "RATE_LIMITED" && error.details !== undefined) {
      const retryAfter = (error.details as { retryAfterSeconds?: unknown })
        .retryAfterSeconds;
      if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
        headers["retry-after"] = String(Math.max(1, Math.ceil(retryAfter)));
      }
    }

    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.expose && error.details !== undefined
            ? { details: error.details }
            : {}),
        },
      },
      { status: error.status, headers },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid request",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }

  logger.error("unhandled error", {
    message: error instanceof Error ? error.message : String(error),
    ...context,
  });
  return Response.json(
    { error: { code: "INTERNAL", message: "Internal error" } },
    { status: 500 },
  );
}
