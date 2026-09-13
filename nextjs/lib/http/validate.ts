import { z } from "zod";
import { AppError } from "./errors";

const MAX_BODY_BYTES = 256 * 1024;

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw AppError.badRequest("Request body too large");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw AppError.badRequest("Request body too large");
    }
    body = raw.length === 0 ? {} : JSON.parse(raw);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest("Request body must be valid JSON");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw AppError.badRequest("Invalid request body", result.error.issues);
  }
  return result.data;
}

export function parseQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.badRequest("Invalid query parameters", result.error.issues);
  }
  return result.data;
}
