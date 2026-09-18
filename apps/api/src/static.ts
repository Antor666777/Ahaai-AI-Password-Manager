import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Hono } from "hono";
import { AppError } from "@ahaai/core/http/errors";
import { API_BASE } from "./app";
import type { Config } from "./config";
import type { AppEnv } from "./types";

export const DEFAULT_STATIC_ROOT = resolve(process.cwd(), "../web/out");

/**
 * Serves the exported frontend from the API, which is what makes the
 * self-hosted bundle a single container on a single origin.
 *
 * Loaded dynamically so a non-Node runtime can import this module without
 * pulling in node:fs.
 */
export async function registerStaticFiles(
  app: Hono<AppEnv>,
  config: Config,
  root: string = DEFAULT_STATIC_ROOT,
): Promise<boolean> {
  if (!config.serveStatic) return false;

  const staticRoot = config.staticRoot ?? root;

  if (!existsSync(staticRoot)) {
    throw new Error(
      `SERVE_STATIC=1 but no frontend build was found at ${staticRoot}. ` +
        `Build it with "npm run build --workspace @ahaai/web", or set STATIC_ROOT to the exported bundle.`,
    );
  }

  const { serveStatic } = await import("@hono/node-server/serve-static");

  app.use(
    "/*",
    serveStatic({
      root: staticRoot,
      rewriteRequestPath: (path) => {
        if (path.includes(".")) return path;
        return path.endsWith("/") ? `${path}index.html` : `${path}/index.html`;
      },
    }),
  );

  // serveStatic falls through when nothing matches, so an unmatched frontend
  // route ends up in notFound. This is the only place the exported 404 page can
  // be served from: this module owns it, and the core app must not touch the
  // filesystem. Registering a handler here supersedes the JSON one in
  // createApp, which stays the answer for the API and for any client that is
  // not asking for HTML.
  const notFoundPage = resolve(staticRoot, "404.html");
  const page = existsSync(notFoundPage)
    ? readFileSync(notFoundPage, "utf8")
    : null;

  if (page !== null) {
    app.notFound((c) => {
      const wantsHtml = (c.req.header("accept") ?? "").includes("text/html");
      if (!wantsHtml || c.req.path.startsWith(API_BASE)) {
        throw AppError.notFound("Route not found");
      }
      return c.html(page, 404);
    });
  }

  return true;
}
