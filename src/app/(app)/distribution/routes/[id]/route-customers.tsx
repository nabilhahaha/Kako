'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, X, Plus } from 'lucide-react';
import { assignCustomerToRoute } from '../../actions';
import { useI18n } from '@/lib/i18n/provider';

export interface Cust { id: string; code: string; name: string; route_id: string | null }

export function RouteCustomers({ routeId, customers }: { routeId: string; customers: Cust[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();

  const assigned = useMemo(() => customers.filter((c) => c.route_id === routeId), [customers, routeId]);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return customers.filter((c) => c.route_id !== routeId && (c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s))).slice(0, 12);
  }, [customers, q, routeId]);

  function set(customerId: string, rid: string | null, ok: string) {
    startTransition(async () => {
      const res = await assignCustomerToRoute(customerId, rid);
      if (!res.ok) { toast.error(res.error ?? t('distribution.errorGeneric')); return; }
      toast.success(ok); router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('distribution.routeCustomersSearchPlaceholder')} className="ps-9" />
        </div>
        {found.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{q ? t('distribution.routeCustomersNoResults') : t('distribution.routeCustomersTypePrompt')}</p>
        ) : (
          <ul className="divide-y">
            {found.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground" dir="ltr">{c.code}</span>{c.route_id && <span className="ms-2 text-xs text-warning">{t('distribution.routeCustomersOnOtherRoute')}</span>}</div>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => set(c.id, routeId, t('distribution.routeCustomersToastAdded'))}><Plus className="h-3.5 w-3.5" /> {t('distribution.routeCustomersBtnAdd')}</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="border-b p-3 font-semibold">{t('distribution.routeCustomersAssignedHeader').replace('{count}', String(assigned.length))}</div>
        {assigned.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t('distribution.routeCustomersEmptyState')}</p>
        ) : (
          <ul className="divide-y">
            {assigned.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div><span className="font-medium">{c.name}</span> <span className="text-xs text-muted-foreground" dir="ltr">{c.code}</span></div>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => set(c.id, null, t('distribution.routeCustomersToastRemoved'))}><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}
