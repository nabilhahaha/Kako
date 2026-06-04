'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCustomerJourney } from '../../customers/actions';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { VISIT_DAYS } from '@/lib/erp/constants';
import type { ErpCustomer, Profile } from '@/lib/erp/types';
import { useI18n } from '@/lib/i18n/provider';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

type Rep = Pick<Profile, 'id' | 'full_name' | 'email'>;

export function JourneyManager({
  customers,
  reps,
}: {
  customers: ErpCustomer[];
  reps: Rep[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [repFilter, setRepFilter] = useState('');
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (repFilter === 'none' && c.salesman_id) return false;
      if (repFilter && repFilter !== 'none' && c.salesman_id !== repFilter) return false;
      if (q && !(c.name.toLowerCase().includes(q) || (c.name_ar || '').toLowerCase().includes(q) || c.code.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [customers, repFilter, query]);

  // Per-day counts (for the selected rep filter, or all).
  const dayCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of filtered) if (c.visit_day) m[c.visit_day] = (m[c.visit_day] ?? 0) + 1;
    return m;
  }, [filtered]);

  function update(id: string, salesmanId: string | null, visitDay: string | null) {
    startTransition(async () => {
      const res = await setCustomerJourney(id, salesmanId, visitDay);
      if (!res.ok) toast.error(res.error ?? t('sales.errorGeneric'));
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t('sales.journeyFilterAllReps')}</option>
          <option value="none">{t('sales.journeyFilterNoRep')}</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
        </select>
        <div className="relative ms-auto">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('sales.journeySearchPlaceholder')} className="w-56 ps-9" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {VISIT_DAYS.map((d) => (
          <Badge key={d.value} variant="secondary">{d[locale]}: {dayCounts[d.value] ?? 0}</Badge>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t('sales.journeyColCustomer')}</th>
                  <th className="p-3 text-start font-medium">{t('sales.journeyColArea')}</th>
                  <th className="p-3 text-start font-medium">{t('sales.journeyColRep')}</th>
                  <th className="p-3 text-start font-medium">{t('sales.journeyColVisitDay')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="p-2 ps-3">
                      <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">{c.code}</span>
                      {c.name_ar || c.name}
                    </td>
                    <td className="p-2 text-muted-foreground">{c.city || '—'}</td>
                    <td className="p-2">
                      <select
                        value={c.salesman_id ?? ''}
                        disabled={pending}
                        onChange={(e) => update(c.id, e.target.value || null, c.visit_day)}
                        className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">{t('sales.journeyNoRepOption')}</option>
                        {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={c.visit_day ?? ''}
                        disabled={pending}
                        onChange={(e) => update(c.id, c.salesman_id, e.target.value || null)}
                        className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">{t('sales.journeyNoRepOption')}</option>
                        {VISIT_DAYS.map((d) => <option key={d.value} value={d.value}>{d[locale]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{t('sales.journeyNoResults')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {t('sales.journeyNote')}
      </p>
    </div>
  );
}
