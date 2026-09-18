"use client";

import "./globals.css";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { ShieldIcon } from "@/components/app/shell/Icons";
import {
  RouteFallback,
  routeSecondaryLinkClass,
} from "@/components/app/shell/RouteFallback";

/**
 * The last resort. `error.tsx` wraps the segments under the root layout; this
 * file is the boundary for the root layout itself, so an error thrown there is
 * caught instead of escaping the app shell entirely.
 *
 * Next renders this in place of the root layout, so it brings its own document
 * and imports the global stylesheet for the palette. Because the root layout is
 * replaced, its theme script and web fonts do not run here: the page settles on
 * the light palette and the system sans stack, which still reads clearly.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <title>Ahaai could not start</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-full">
        <RouteFallback
          status="Error"
          icon={<ShieldIcon className="size-5" />}
          title="Ahaai could not start"
          description="A problem stopped the app from loading. Nothing in your vault was changed. Reload the page to try again."
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
      </body>
    </html>
  );
}
