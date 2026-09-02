/**
 * Generic page skeleton used by every `loading.tsx` in the app. Appears
 * instantly when the user clicks a nav link while the real page is still
 * rendering on the server. See Next.js docs:
 *   docs/01-app/01-getting-started/04-linking-and-navigating.md
 *   docs/01-app/03-api-reference/03-file-conventions/loading.md
 */
export function PageSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-4xl space-y-4 py-4"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>

      <div className="h-7 w-48 animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="h-4 w-72 animate-pulse rounded-md bg-zinc-200/50 dark:bg-zinc-800/50" />

      <div className="grid gap-4 pt-3 sm:grid-cols-2">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="h-5 w-1/3 animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-md bg-zinc-200/60 dark:bg-zinc-800/60"
            style={{ width: `${70 + ((i * 13) % 25)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
