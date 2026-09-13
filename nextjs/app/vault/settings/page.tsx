"use client";

import { SettingsScreen } from "@/components/app/settings/SettingsScreen";

/**
 * The Configure surface. Data loading lives in the screen component so the
 * route file stays a mount point.
 */
export default function VaultSettingsPage() {
  return <SettingsScreen />;
}
