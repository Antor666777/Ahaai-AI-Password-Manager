"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/client/session";
import { ToastProvider } from "@/lib/client/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
