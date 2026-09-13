"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ShellSkeleton } from "@/components/app/shell/ShellSkeleton";
import { VaultShell } from "@/components/app/shell/VaultShell";
import { useSession } from "@/lib/client/session";
import { VaultProvider } from "@/lib/client/vault";

/**
 * The gate for every /vault route. Nothing under here renders until a session
 * exists and the vault key is in memory, so no page has to re-check.
 */
export default function VaultLayout({ children }: { children: ReactNode }) {
  const { status, locked } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/");
    else if (status === "authenticated" && locked) router.replace("/unlock");
  }, [status, locked, router]);

  if (status !== "authenticated" || locked) {
    return <ShellSkeleton />;
  }

  return (
    <VaultProvider>
      <VaultShell>{children}</VaultShell>
    </VaultProvider>
  );
}
