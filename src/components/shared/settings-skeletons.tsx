import { Skeleton } from '@/components/ui/skeleton';

/** Tailored loading placeholders for the Back Office screens so each route's
 *  first paint matches its real shape (instead of the generic page skeleton). */

function Header() {
  return (
    <div className="mb-5 space-y-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-7 w-64 max-w-full" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** Summary cards + a responsive card grid (finance, tax, numbering, approvals…). */
export function CardsSkeleton() {
  return (
    <div>
      <Header />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );
}

/** Toolbar + an indented tree of rows (organization / product structure). */
export function TreeSkeleton() {
  return (
    <div>
      <Header />
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="space-y-1.5">
        {[0, 1, 1, 2, 2, 1, 0, 1].map((depth, i) => (
          <div key={i} style={{ marginInlineStart: depth * 20 }}>
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Progress card + a stack of step rows (Go-Live cockpit). */
export function ChecklistSkeleton() {
  return (
    <div>
      <Header />
      <Skeleton className="mb-4 h-28 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    </div>
  );
}
