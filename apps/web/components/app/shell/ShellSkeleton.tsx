import { Skeleton } from "@/components/ui/feedback";

/**
 * Shown while the session is looked up and while a redirect is in flight. It
 * keeps the rail, the top bar, and a row of item shapes so nothing jumps when
 * the real vault arrives.
 */
export function ShellSkeleton() {
  return (
    <div role="status" className="min-h-dvh bg-paper">
      <span className="sr-only">Checking this browser and loading your vault</span>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="hidden h-dvh border-e border-line bg-surface-2 p-3 lg:block">
          <Skeleton className="h-5 w-16" />
          <div className="mt-6 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="mt-6 space-y-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex min-h-14 items-center justify-between border-b border-line px-3 py-2 lg:hidden">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="size-10" />
          </div>

          <div className="mx-auto w-full max-w-[84rem] space-y-4 px-4 py-6 sm:px-6 lg:px-9">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-10 w-full" />
            <div className="rounded-lg border border-line bg-surface p-3">
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-[52px] w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
