'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AdminWorkbench — the unified three-panel admin shell (left list · center
 * detail · right context). Pure layout: selection/tab state is URL-addressable
 * via useWorkbenchSelection. Responsive: ≥xl shows all three; on smaller screens
 * the right context becomes a slide-over drawer (Info button). No business logic.
 *
 * `layout`:
 *  - `'default'` (admin entities) — list 280 · center (capped 860) · context 320.
 *  - `'wide'` (operational, e.g. the Customer Workbench) — the center detail is
 *    the primary focus: a slimmer list (256) + compact context (300), the center
 *    uncapped and given the majority of width, and — crucially — when a tab omits
 *    `context` the grid drops the third track so the center spans the full width
 *    (dynamic per-tab sizing; data-dense tabs get everything). Mobile is identical
 *    for both: center full-width, context collapses to the Info drawer.
 */
export function AdminWorkbench({
  list,
  detail,
  context,
  contextLabel = 'Details',
  layout = 'default',
}: {
  list: ReactNode;
  detail: ReactNode;
  context?: ReactNode;
  contextLabel?: string;
  layout?: 'default' | 'wide';
}) {
  const [drawer, setDrawer] = useState(false);
  const wide = layout === 'wide';
  // Default stays byte-identical to preserve every existing workbench. Wide tunes
  // the tracks toward the center and collapses the context track when absent.
  const grid = wide
    ? context
      ? 'lg:grid-cols-[256px_1fr] xl:grid-cols-[256px_minmax(0,1fr)_300px]'
      : 'lg:grid-cols-[256px_1fr] xl:grid-cols-[256px_minmax(0,1fr)]'
    : 'lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_320px]';
  const detailMax = wide ? '' : 'max-w-[860px]';
  return (
    <div className={`relative grid gap-4 ${grid}`}>
      <aside className="lg:sticky lg:top-4 lg:self-start">{list}</aside>
      <section className="min-w-0">
        {context && (
          <div className="mb-2 flex justify-end xl:hidden">
            <button
              onClick={() => setDrawer(true)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
            >
              <Info className="h-3.5 w-3.5" /> {contextLabel}
            </button>
          </div>
        )}
        <div className={`min-w-0 ${detailMax}`}>{detail}</div>
      </section>
      {context && <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">{context}</aside>}

      {/* Context drawer (tablet/mobile) */}
      {context && drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 xl:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-[320px] max-w-[85vw] overflow-auto bg-background p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button onClick={() => setDrawer(false)} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            {context}
          </div>
        </div>
      )}
    </div>
  );
}

/** URL-addressable selection + tab state for a workbench (?id=…&tab=…). */
export function useWorkbenchSelection(defaultTab: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get('id');
  const tab = params.get('tab') ?? defaultTab;

  const push = (next: URLSearchParams) => router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  const select = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('id', id);
    if (!next.get('tab')) next.set('tab', defaultTab);
    push(next);
  };
  const setTab = (t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    push(next);
  };
  return { selectedId, tab, select, setTab };
}

export function cnPanel(...c: Parameters<typeof cn>) {
  return cn(...c);
}
