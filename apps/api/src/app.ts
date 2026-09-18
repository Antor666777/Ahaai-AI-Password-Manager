import { Hono } from "hono";
import { getBearerToken } from "@ahaai/core/auth/bearer";
import { assertSameOrigin } from "@ahaai/core/auth/csrf";
import { getClientIp } from "@ahaai/core/auth/request-context";
import { corsHeaders, exactOrigins } from "@ahaai/core/http/cors";
import { AppError } from "@ahaai/core/http/errors";
import { jsonError } from "@ahaai/core/http/responses";
import { securityHeaders } from "@ahaai/core/http/security-headers";
import { enforceRateLimit } from "@ahaai/core/rate-limit";
import { registerAiRoutes } from "./routes/ai";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoutes } from "./routes/health";
import { registerPwnedRoutes } from "./routes/pwned";
import { registerVaultRoutes } from "./routes/vault";
import type { AppEnv, Deps } from "./types";

export const API_BASE = "/api/v1";

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const corsEnabled = deps.config.corsAllowedOrigins.length > 0;
  const trustedOrigins = exactOrigins(deps.config.corsAllowedOrigins);

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    deps.logger.info("http.request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });

  app.use("*", async (c, next) => {
    await next();
    const headers = securityHeaders({
      isDevelopment: !deps.config.isProduction,
      isSecure: deps.config.isProduction,
      connectSrc: ["'self'", ...deps.config.corsAllowedOrigins],
      crossOriginResourcePolicy: corsEnabled ? "cross-origin" : "same-origin",
    });
    for (const [key, value] of Object.entries(headers)) {
      c.res.headers.set(key, value);
    }
  });

  app.use(`${API_BASE}/*`, async (c, next) => {
    const origin = c.req.header("origin") ?? null;
    const headers = corsHeaders(origin, deps.config.corsAllowedOrigins);

    if (
      c.req.method === "OPTIONS" &&
      c.req.header("access-control-request-method")
    ) {
      return new Response(null, { status: 204, headers });
    }

    await next();
    c.res.headers.set("Cache-Control", "no-store");
    for (const [key, value] of Object.entries(headers)) {
      c.res.headers.set(key, value);
    }
  });

  // A bearer token cannot be attached by a cross-site form or image, so CSRF
  // applies only to the cookie flow. An explicitly listed origin (a separate
  // frontend host, for instance) is treated as trusted; wildcards are not.
  app.use(`${API_BASE}/*`, async (c, next) => {
    if (!getBearerToken(c.req.raw)) assertSameOrigin(c.req.raw, trustedOrigins);
    await next();
  });

  // One coarse ceiling per client IP in front of every API route, so endpoints
  // without a stricter rule of their own (vault writes, sync, sessions, events,
  // provider CRUD) are still throttled. Stricter per-route rules keep applying
  // on top of this one.
  app.use(`${API_BASE}/*`, async (c, next) => {
    const ip = getClientIp(c.req.raw, { trustProxy: deps.config.trustProxy });
    await enforceRateLimit("global", `ip:${ip ?? "unknown"}`);
    await next();
  });

  const api = new Hono<AppEnv>();
  registerAuthRoutes(api);
  registerVaultRoutes(api);
  registerAiRoutes(api);
  registerPwnedRoutes(api);
  app.route(API_BASE, api);

  registerHealthRoutes(app);

  app.notFound(() => {
    throw AppError.notFound("Route not found");
  });

  app.onError((error, c) => {
    const response = jsonError(error, {
      route: c.req.path,
      method: c.req.method,
    });
    if (response.status < 500) {
      deps.logger.warn("http.rejected", {
        method: c.req.method,
        path: c.req.path,
        status: response.status,
      });
    }
    return response;
  });

  return app;
}
