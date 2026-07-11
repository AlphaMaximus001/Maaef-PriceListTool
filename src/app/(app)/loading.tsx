/**
 * Instant loading state for every page under the app shell. Because this lives
 * beside the (app) layout, the sidebar + header stay put and only the content
 * area shows this skeleton the moment you navigate — so a slow (dynamic) page
 * never looks frozen. Next.js swaps in the real page as soon as it's ready.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      {/* Title + subtitle */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted/70" />
      </div>

      {/* Toolbar row */}
      <div className="flex flex-wrap gap-2">
        <div className="h-9 w-40 rounded-md bg-muted" />
        <div className="h-9 w-32 rounded-md bg-muted/70" />
        <div className="ml-auto h-9 w-28 rounded-md bg-muted/70" />
      </div>

      {/* Content block (table / cards) */}
      <div className="overflow-hidden rounded-lg border">
        <div className="h-10 bg-maaef-blush/40" />
        <div className="divide-y">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-4 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-4 flex-1 rounded bg-muted/60" />
              <div className="h-4 w-20 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
