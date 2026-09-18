import type { ReactNode } from "react";

/**
 * The frame shared by the route error boundary, the root error and the 404.
 *
 * It paints inside whatever layout is active, so it stays free of the session,
 * the vault and the toast providers: an unmatched address or a render fault can
 * land here before a session exists, or with every provider gone.
 *
 * The state is always carried in text, never in colour alone, and the glyph only
 * ever accompanies that text.
 */
export function RouteFallback({
  status,
  icon,
  title,
  description,
  note,
  children,
}: {
  /** A short label for the state, shown as text next to the heading. */
  status: string;
  /** From Icons.tsx. A companion to the title, never the only signal. */
  icon: ReactNode;
  title: string;
  description: string;
  /** An optional aside, such as the error reference code. */
  note?: ReactNode;
  /** The actions, usually a way back into the app. */
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-9 text-center sm:px-6 lg:px-9">
      <div className="w-full max-w-[40rem]">
        <div className="mx-auto grid size-11 place-items-center rounded-lg border border-line bg-surface-2 text-ink-faint">
          {icon}
        </div>

        <p className="mono-data mt-4 text-[13px] font-medium tracking-wide text-ink-muted">
          {status}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-ink">{title}</h1>
        <p className="mx-auto mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
          {description}
        </p>

        {note ? <div className="mx-auto mt-4 max-w-[32rem]">{note}</div> : null}

        {children ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
            {children}
          </div>
        ) : null}
      </div>
    </main>
  );
}

/**
 * A link that reads as a Button beside one. These mirror the Button primitive's
 * secondary and primary variants, because navigation has to stay a real anchor
 * so the fallback pages still work with no JavaScript.
 */
export const routeSecondaryLinkClass =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2";

export const routePrimaryLinkClass =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover";
