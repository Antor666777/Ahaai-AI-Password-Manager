import type { Hono } from "hono";
import { jsonOk } from "@ahaai/core/http/responses";
import type { AppEnv } from "../types";

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  app.get("/health", () =>
    jsonOk({
      status: "ok",
      service: "ahaai-password-manager",
      time: new Date().toISOString(),
    }),
  );
}
