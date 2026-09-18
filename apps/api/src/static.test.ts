import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@ahaai/core/http/errors";
import { jsonError } from "@ahaai/core/http/responses";
import { API_BASE } from "./app";
import { loadConfig } from "./config";
import type { AppEnv } from "./types";

/**
 * A bare app with the same notFound/onError wiring as createApp, so the test
 * exercises the static layer rather than the whole API (and needs no database).
 */
function makeApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get(`${API_BASE}/thing`, (c) => c.json({ ok: true }));
  app.notFound(() => {
    throw AppError.notFound("Route not found");
  });
  app.onError((error) => jsonError(error, {}));
  return app;
}

const INDEX = "<!doctype html><title>index page</title>";
const NOT_FOUND = "<!doctype html><title>ahaai not found</title>";

/** `Response.json()` is `unknown` without the DOM lib, so narrow it here. */
async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("serving the exported frontend", () => {
  let root: string;
  let app: Hono<AppEnv>;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "ahaai-static-"));
    writeFileSync(join(root, "index.html"), INDEX);
    writeFileSync(join(root, "404.html"), NOT_FOUND);

    const config = loadConfig({
      AUTH_PEPPER: "a".repeat(32),
      ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
      SERVE_STATIC: "1",
    });

    const { registerStaticFiles } = await import("./static");
    app = makeApp();
    await registerStaticFiles(app, config, root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("serves a file from the export", async () => {
    const response = await app.request("/index.html");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("index page");
  });

  it("serves the exported 404 page to a browser on a stale link", async () => {
    const response = await app.request("/vault/gone", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("ahaai not found");
  });

  it("keeps the JSON error shape for the API", async () => {
    const response = await app.request(`${API_BASE}/nope`, {
      headers: { accept: "text/html" },
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe("NOT_FOUND");
  });

  it("keeps the JSON error shape for a non-HTML client", async () => {
    const response = await app.request("/missing.png", {
      headers: { accept: "image/png" },
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe("NOT_FOUND");
  });

  it("does nothing when the export has no 404 page", async () => {
    const bare = mkdtempSync(join(tmpdir(), "ahaai-static-bare-"));
    writeFileSync(join(bare, "index.html"), INDEX);

    const config = loadConfig({
      AUTH_PEPPER: "a".repeat(32),
      ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
      SERVE_STATIC: "1",
    });

    const { registerStaticFiles } = await import("./static");
    const bareApp = makeApp();
    await registerStaticFiles(bareApp, config, bare);

    const response = await bareApp.request("/vault/gone", {
      headers: { accept: "text/html" },
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe("NOT_FOUND");

    rmSync(bare, { recursive: true, force: true });
  });
});
