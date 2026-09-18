import type { Hono } from "hono";
import { createProviderSchema, updateSettingsSchema, updateProviderSchema } from "@ahaai/core/ai/schemas";
import { listPresets } from "@ahaai/core/ai/presets";
import { searchRequestSchema } from "@ahaai/core/ai/search-schemas";
import { searchVault } from "@ahaai/core/ai/search";
import { toPublicProvider } from "@ahaai/core/ai/serializers";
import {
  createProvider,
  deleteProvider,
  getAiSettings,
  listProviders,
  updateAiSettings,
  updateProvider,
} from "@ahaai/core/ai/service";
import { testProviderConnection } from "@ahaai/core/ai/test-connection";
import { recordSecurityEvent } from "@ahaai/core/auth/audit";
import { requireAuth } from "@ahaai/core/auth/guard";
import { getRequestContext } from "@ahaai/core/auth/request-context";
import { toSettingsView } from "@ahaai/core/auth/serializers";
import { jsonCreated, jsonOk } from "@ahaai/core/http/responses";
import { parseIdParam, parseJson } from "@ahaai/core/http/validate";
import { enforceRateLimit } from "@ahaai/core/rate-limit";
import type { AppEnv } from "../types";

export function registerAiRoutes(app: Hono<AppEnv>): void {
  app.get("/ai/providers", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);

    const providers = await listProviders(db, user.id);

    return jsonOk({
      providers: providers.map(toPublicProvider),
      presets: listPresets(),
    });
  });

  app.post("/ai/providers", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const body = await parseJson(c.req.raw, createProviderSchema);

    const provider = await createProvider(db, user.id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.provider.created",
      ...getRequestContext(c.req.raw, {
        trustProxy: c.get("deps").config.trustProxy,
      }),
      metadata: { providerId: provider.id, presetId: provider.presetId },
    });

    return jsonCreated({ provider: toPublicProvider(provider) });
  });

  app.patch("/ai/providers/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));
    const body = await parseJson(c.req.raw, updateProviderSchema);

    const provider = await updateProvider(db, user.id, id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.provider.updated",
      ...getRequestContext(c.req.raw, {
        trustProxy: c.get("deps").config.trustProxy,
      }),
      metadata: { providerId: provider.id },
    });

    return jsonOk({ provider: toPublicProvider(provider) });
  });

  app.delete("/ai/providers/:id", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const id = parseIdParam(c.req.param("id"));

    await deleteProvider(db, user.id, id);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.provider.deleted",
      severity: "warning",
      ...getRequestContext(c.req.raw, {
        trustProxy: c.get("deps").config.trustProxy,
      }),
      metadata: { providerId: id },
    });

    return jsonOk({ ok: true });
  });

  app.post("/ai/providers/:id/test", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("aiProviderTest", `user:${user.id}`);
    const id = parseIdParam(c.req.param("id"));

    const result = await testProviderConnection(db, user.id, id);
    return jsonOk(result);
  });

  app.get("/ai/settings", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);

    const settings = await getAiSettings(db, user.id);
    return jsonOk({ settings: toSettingsView(settings) });
  });

  app.put("/ai/settings", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    const body = await parseJson(c.req.raw, updateSettingsSchema);

    const settings = await updateAiSettings(db, user.id, body);
    return jsonOk({ settings: toSettingsView(settings) });
  });

  app.post("/ai/search", async (c) => {
    const { db } = c.get("deps");
    const { user } = await requireAuth(db, c.req.raw);
    await enforceRateLimit("aiSearch", `user:${user.id}`);
    const body = await parseJson(c.req.raw, searchRequestSchema);

    const result = await searchVault(db, user.id, body);

    await recordSecurityEvent(db, {
      userId: user.id,
      type: "ai.search.performed",
      ...getRequestContext(c.req.raw, {
        trustProxy: c.get("deps").config.trustProxy,
      }),
      metadata: {
        mode: body.mode,
        engine: result.engine,
        presetId: result.presetId,
        modelId: result.modelId,
        intent: result.intent,
        zeroDataRetention: result.zeroDataRetention,
        candidateCount: result.candidateCount,
        shortlistCount: result.shortlistCount,
        matchCount: result.matches.length,
        truncated: result.truncated,
      },
    });

    return jsonOk({
      matches: result.matches,
      modelId: result.modelId,
      presetId: result.presetId,
      isLocal: result.isLocal,
      mode: result.mode,
      engine: result.engine,
      intent: result.intent,
      zeroDataRetention: result.zeroDataRetention,
      shortlistCount: result.shortlistCount,
      truncated: result.truncated,
    });
  });
}
