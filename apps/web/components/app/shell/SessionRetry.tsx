"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { useSession } from "@/lib/client/session";

/**
 * Shown when the session lookup failed for a reason other than "not signed in".
 * A network drop or a server fault is not a sign out, so this offers a retry
 * instead of the sign in form.
 */
export function SessionRetry() {
  const { refresh, error } = useSession();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Callout tone="warning" title="Could not reach the server">
      <p>
        {error ??
          "This browser may still hold a session, but Ahaai could not confirm it. Nothing was signed out."}
      </p>
      <div className="mt-3">
        <Button size="sm" loading={retrying} onClick={() => void retry()}>
          Try again
        </Button>
      </div>
    </Callout>
  );
}
