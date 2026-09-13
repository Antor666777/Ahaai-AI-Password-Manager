import { eq } from "drizzle-orm";
import type { AiMode } from "@/lib/db/schema";
import { userSettings } from "@/lib/db/schema";
import type { Database } from "@/lib/db/types";

export interface SettingsView {
  aiMode: AiMode;
  defaultProviderId: string | null;
  updatedAt: Date | null;
}

export async function getSettings(
  db: Database,
  userId: string,
): Promise<SettingsView> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) {
    return { aiMode: "cloud", defaultProviderId: null, updatedAt: null };
  }

  return {
    aiMode: row.aiMode,
    defaultProviderId: row.defaultProviderId,
    updatedAt: row.updatedAt,
  };
}

export async function ensureSettings(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing({ target: userSettings.userId });
}
