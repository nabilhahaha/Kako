// Shown instantly on every in-app navigation while the server component loads,
// so the sidebar/topbar stay stable and the content area never goes blank.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-cream-deep/70" />
        <div className="h-4 w-80 rounded bg-cream-deep/50" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-line bg-white/60" />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="h-10 border-b border-line bg-cream-deep/30" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line/50 px-4 py-3 last:border-0">
            <div className="h-4 w-1/4 rounded bg-cream-deep/50" />
            <div className="h-4 w-1/5 rounded bg-cream-deep/40" />
            <div className="h-4 w-1/6 rounded bg-cream-deep/40" />
            <div className="ml-auto h-4 w-16 rounded bg-cream-deep/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
