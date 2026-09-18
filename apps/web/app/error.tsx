"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { ShieldIcon } from "@/components/app/shell/Icons";
import {
  RouteFallback,
  routeSecondaryLinkClass,
} from "@/components/app/shell/RouteFallback";

/**
 * The error boundary for the route segments under the root layout.
 *
 * The raw error message and stack are never rendered. Internal details are not
 * something this app shows a user, and a client error can carry a value from
 * memory. The digest is the one detail that is safe: it matches the server log
 * without describing the fault.
 *
 * `reset` is the recovery path. A static export has no server to re-fetch from
 * on retry, so clearing the boundary and re-rendering the segment is exactly the
 * behaviour that can help, which is what `reset` does.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // There is no client logger wired into the app, so the browser console is
    // where a developer or a crash reporter can pick this up. Nothing from the
    // error is shown to the user.
    console.error(error);
  }, [error]);

  return (
    <RouteFallback
      status="Error"
      icon={<ShieldIcon className="size-5" />}
      title="Something went wrong on this page"
      description="Ahaai could not finish drawing this screen. Nothing in your vault was changed. Try again, or go back to a page that works."
      note={
        error.digest ? (
          <Callout title="Reference code">
            <span className="mono-data text-[12px]">{error.digest}</span>
          </Callout>
        ) : null
      }
    >
      <Button variant="primary" onClick={() => reset()}>
        Try again
      </Button>
      <Link href="/" className={routeSecondaryLinkClass}>
        Go home
      </Link>
    </RouteFallback>
  );
}
