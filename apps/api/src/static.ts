import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Hono } from "hono";
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

  return true;
}
