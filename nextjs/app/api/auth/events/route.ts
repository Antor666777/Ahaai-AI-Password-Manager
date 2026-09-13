import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { securityEvents } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { parseQuery } from "@/lib/http/validate";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
    .optional(),
});

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { user } = await requireAuth(db, request);
    const { limit, before } = parseQuery(request, querySchema);

    const conditions: SQL[] = [eq(securityEvents.userId, user.id)];
    if (before) {
      conditions.push(lt(securityEvents.createdAt, new Date(before)));
    }

    const events = await db
      .select()
      .from(securityEvents)
      .where(and(...conditions))
      .orderBy(desc(securityEvents.createdAt))
      .limit(limit);

    const last = events.at(-1);

    return jsonOk({
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor:
        events.length === limit && last ? last.createdAt.toISOString() : null,
    });
  } catch (error) {
    return jsonError(error, { route: "auth/events" });
  }
}
