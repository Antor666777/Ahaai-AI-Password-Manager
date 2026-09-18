import Link from "next/link";
import { SearchIcon } from "@/components/app/shell/Icons";
import {
  RouteFallback,
  routePrimaryLinkClass,
  routeSecondaryLinkClass,
} from "@/components/app/shell/RouteFallback";

/**
 * The root 404. A static export writes this to `out/404.html`, which a static
 * host serves for any address that has no exported route.
 *
 * It can render for a visitor who is not signed in, not unlocked, or has no
 * session at all, so it never reaches for `useSession()` or `useVault()`. Only
 * links and text, which work with JavaScript off.
 */
export default function NotFound() {
  return (
    <>
      <title>Page not found, Ahaai</title>

      <RouteFallback
        status="404"
        icon={<SearchIcon className="size-5" />}
        title="Page not found"
        description="The address you opened does not match a page in Ahaai. The link may be out of date, or the page may have moved."
      >
        <Link href="/" className={routePrimaryLinkClass}>
          Go home
        </Link>
        <Link href="/vault" className={routeSecondaryLinkClass}>
          Open the vault
        </Link>
      </RouteFallback>
    </>
  );
}
