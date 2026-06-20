'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { TisCustomer } from '@/lib/tis/dataset';
import { scopeOptions, withRegion, withSalesman, toggleRoute, emptyScope, isScoped, type ScopeState, type ScopeOption } from '@/lib/tis/scope';

/**
 * Shared scope bar (STUDIO-UX hardening) — progressive Region → Salesman → Route
 * drill-down. Controlled: the parent owns `scope` state so it can drive every stage
 * + the persistent map from one source of truth. Used by the Studio (shared across
 * stages) and the standalone Planning Board.
 */
export function ScopeBar({ customers, scope, onChange, labels = {} }: {
  customers: readonly TisCustomer[]; scope: ScopeState; onChange: (next: ScopeState) => void; labels?: Record<string, string>;
}) {
  const { t } = useI18n();
  const opts = useMemo(() => scopeOptions(customers, scope), [customers, scope]);
  const routeIndex = useMemo(() => {
    const ids = [...new Set(customers.map((c) => c.ownership.routeId).filter((r): r is string => !!r))].sort();
    return new Map(ids.map((id, i) => [id, i]));
  }, [customers]);

  const regionLabel = (id: string) => (id ? labels[id] ?? id : t('planBoard.unassigned'));
  const salesmanLabel = (id: string) => (id ? labels[id] ?? id : t('planBoard.unassignedSalesman'));
  const routeLabel = (id: string) => (id ? labels[id] ?? `${t('routeOpt.route')} ${(routeIndex.get(id) ?? 0) + 1}` : t('planBoard.unassigned'));

  const shownRoutes = scope.routes.length > 0 ? scope.routes.length : opts.routes.filter((r) => r.key).length;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
      <ScopeSelect label={t('planBoard.scopeRegion')} value={scope.region} allLabel={t('planBoard.allRegions')} options={opts.regions} labelOf={regionLabel} onChange={(v) => onChange(withRegion(v))} />
      <ScopeSelect label={t('planBoard.scopeSalesman')} value={scope.salesman} allLabel={t('planBoard.allSalesmen')} options={opts.salesmen} labelOf={salesmanLabel} onChange={(v) => onChange(withSalesman(scope, v))} />
      {opts.routes.filter((r) => r.key).length > 1 && (
        <div className="flex max-w-full items-center gap-1 overflow-x-auto">
          <span className="shrink-0 text-xs text-muted-foreground">{t('planBoard.scopeRoutes')}:</span>
          {opts.routes.filter((r) => r.key).slice(0, 40).map((r) => (
            <button key={r.key} onClick={() => onChange(toggleRoute(scope, r.key))} className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${scope.routes.includes(r.key) ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted'}`}>{routeLabel(r.key)}</button>
          ))}
        </div>
      )}
      <span className="ms-auto shrink-0 text-xs text-muted-foreground" dir="ltr">
        {t('planBoard.showingScope').replace('{r}', String(shownRoutes)).replace('{total}', String(opts.totalRoutes)).replace('{n}', String(opts.working.length))}
      </span>
      {isScoped(scope) && <button onClick={() => onChange(emptyScope())} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"><X className="h-3 w-3" /> {t('planBoard.clearScope')}</button>}
    </div>
  );
}

function ScopeSelect({ label, value, onChange, allLabel, options, labelOf }: {
  label: string; value: string; onChange: (v: string) => void; allLabel: string; options: ScopeOption[]; labelOf: (id: string) => string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select className="h-8 max-w-[180px] rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.key || '__none'} value={o.key}>{labelOf(o.key)} ({o.count})</option>)}
      </select>
    </label>
  );
}
