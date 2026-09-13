export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNPROCESSABLE"
  | "UPSTREAM"
  | "INTERNAL";

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNPROCESSABLE: 422,
  UPSTREAM: 502,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  status?: number;
  details?: unknown;
  expose?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.details = options.details;
    this.expose = options.expose ?? this.status < 500;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError("BAD_REQUEST", message, { details });
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError("UNAUTHORIZED", message);
  }

  static forbidden(message = "Not allowed"): AppError {
    return new AppError("FORBIDDEN", message);
  }

  static notFound(message = "Not found"): AppError {
    return new AppError("NOT_FOUND", message);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError("CONFLICT", message, { details });
  }

  static rateLimited(message = "Too many requests", details?: unknown): AppError {
    return new AppError("RATE_LIMITED", message, { details });
  }

  static upstream(message = "Upstream service error", cause?: unknown): AppError {
    return new AppError("UPSTREAM", message, { cause });
  }

  static internal(message = "Internal error", cause?: unknown): AppError {
    return new AppError("INTERNAL", message, { cause });
  }
}
