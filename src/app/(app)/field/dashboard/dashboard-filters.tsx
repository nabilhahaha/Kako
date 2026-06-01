'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';

export interface FilterOption { id: string; name: string }

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

/** Dashboard filter bar: view (daily/weekly/monthly) + route + rep. Navigates via
 *  query params; the server refetches trends/scores accordingly. */
export function DashboardFilters({ view, route, rep, routes, reps }: {
  view: string; route: string | null; rep: string | null; routes: FilterOption[]; reps: FilterOption[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  function go(next: { view?: string; route?: string | null; rep?: string | null }) {
    const v = next.view ?? view;
    const r = next.route === undefined ? route : next.route;
    const p = next.rep === undefined ? rep : next.rep;
    const params = new URLSearchParams();
    params.set('view', v);
    if (r) params.set('route', r);
    if (p) params.set('rep', p);
    router.push(`/field/dashboard?${params.toString()}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls} value={view} onChange={(e) => go({ view: e.target.value })}>
        {['daily', 'weekly', 'monthly'].map((v) => <option key={v} value={v}>{t(`field.dashboard.${v}`)}</option>)}
      </select>
      <select className={selectCls} value={route ?? ''} onChange={(e) => go({ route: e.target.value || null })}>
        <option value="">{t('field.dashboard.allRoutes')}</option>
        {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className={selectCls} value={rep ?? ''} onChange={(e) => go({ rep: e.target.value || null })}>
        <option value="">{t('field.dashboard.allReps')}</option>
        {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
  );
}
