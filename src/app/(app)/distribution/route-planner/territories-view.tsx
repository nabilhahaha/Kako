'use client';

import { useMemo, useState } from 'react';
import { Globe2, MapPin, UserX, UploadCloud } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import type { DpCustomer } from '@/lib/tis/day-planner-import';

type GroupKey = 'region' | 'city' | 'area';

interface Agg { key: string; count: number; withGps: number; unassigned: number }

/**
 * Territories screen (redesign Phase D, non-DB part) — Region / City / Area
 * breakdowns derived from the loaded customers: counts, GPS coverage and unassigned
 * (no salesman). Reuses the customer dataset; Draw Areas + Territory Assignment
 * (which need the map + the reporting/territory model) remain queued.
 */
export function TerritoriesView({ customers, initialGroup = 'region', onImport }: {
  customers: DpCustomer[];
  initialGroup?: GroupKey;
  onImport: () => void;
}) {
  const { t } = useI18n();
  const [group, setGroup] = useState<GroupKey>(initialGroup);

  const rows = useMemo<Agg[]>(() => {
    const m = new Map<string, Agg>();
    for (const c of customers) {
      const k = ((c[group] ?? '') as string).toString().trim() || '—';
      const a = m.get(k) ?? { key: k, count: 0, withGps: 0, unassigned: 0 };
      a.count++;
      if (Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0)) a.withGps++;
      if (!((c.salesman ?? '') as string).toString().trim()) a.unassigned++;
      m.set(k, a);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [customers, group]);

  if (customers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Globe2 className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-lg font-semibold">{t('rpShell.g_territories')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('rpShell.cust_empty')}</p>
        <Button onClick={onImport}><UploadCloud className="h-4 w-4" /> {t('rpShell.i_importCustomers')}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold">{t('rpShell.g_territories')}</p>
          <span className="text-xs text-muted-foreground">{rows.length} {t(`dayPlanner.f_${group}`)}</span>
        </div>
        <div className="flex items-center gap-1">
          {(['region', 'city', 'area'] as GroupKey[]).map((g) => (
            <button key={g} onClick={() => setGroup(g)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${group === g ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{t(`dayPlanner.f_${g}`)}</button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="px-2 py-1.5 text-start font-semibold">{t(`dayPlanner.f_${group}`)}</th>
              <th className="px-2 py-1.5 text-end font-semibold">{t('rpShell.cust_count')}</th>
              <th className="px-2 py-1.5 text-end font-semibold"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS</span></th>
              <th className="px-2 py-1.5 text-end font-semibold"><span className="inline-flex items-center gap-1"><UserX className="h-3 w-3" /> {t('rpShell.terr_unassigned')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gpsPct = r.count ? Math.round((r.withGps / r.count) * 100) : 0;
              return (
                <tr key={r.key} className="border-t hover:bg-muted/40">
                  <td className="px-2 py-1 font-medium">{r.key}</td>
                  <td className="px-2 py-1 text-end tabular-nums" dir="ltr">{r.count}</td>
                  <td className={`px-2 py-1 text-end tabular-nums ${gpsPct < 80 ? 'text-amber-600' : 'text-emerald-600'}`} dir="ltr">{r.withGps} ({gpsPct}%)</td>
                  <td className={`px-2 py-1 text-end tabular-nums ${r.unassigned > 0 ? 'text-red-600' : 'text-muted-foreground'}`} dir="ltr">{r.unassigned}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
