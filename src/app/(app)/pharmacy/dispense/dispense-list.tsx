'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Search, Pill, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { createDispense } from '../actions';

export interface DispenseRow { id: string; status: string; patient_name: string | null; doctor_name: string | null; rx_number: string | null; is_controlled: boolean; dispensed_at: string; item_count: number }

const STATUS_VARIANT: Record<string, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  open: 'warning', done: 'success', cancelled: 'destructive',
};

export function DispenseList({ rows }: { rows: DispenseRow[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.patient_name || '').toLowerCase().includes(s) || (r.doctor_name || '').toLowerCase().includes(s) || (r.rx_number || '').toLowerCase().includes(s));
  }, [rows, q]);

  function start() {
    startTransition(async () => {
      const res = await createDispense();
      if (!res.ok || !res.data) { toast.error(res.error ?? t('pharmacy.toastOpenFailed')); return; }
      router.push(`/pharmacy/dispense/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button disabled={pending} onClick={start}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('pharmacy.btnNewDispense')}</Button>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pharmacy.searchPlaceholder')} className="w-64 pr-9" />
        </div>
      </div>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><Pill className="h-8 w-8" /><p>{rows.length === 0 ? t('pharmacy.emptyDispenses') : t('pharmacy.noResults')}</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-right font-medium">{t('pharmacy.colDate')}</th><th className="p-3 text-right font-medium">{t('pharmacy.colPatient')}</th><th className="p-3 text-right font-medium">{t('pharmacy.colDoctor')}</th><th className="p-3 text-right font-medium">{t('pharmacy.colRx')}</th><th className="p-3 text-center font-medium">{t('pharmacy.colItems')}</th><th className="p-3 text-center font-medium">{t('pharmacy.colStatus')}</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const variant = STATUS_VARIANT[r.status] ?? 'secondary';
                const statusLabel = r.status === 'open' ? t('pharmacy.statusOpen') : r.status === 'done' ? t('pharmacy.statusDone') : r.status === 'cancelled' ? t('pharmacy.statusCancelled') : r.status;
                return (
                  <tr key={r.id} className="cursor-pointer border-b hover:bg-secondary/30" onClick={() => router.push(`/pharmacy/dispense/${r.id}`)}>
                    <td className="p-3 text-muted-foreground" dir="ltr">{formatDate(r.dispensed_at, INTL_LOCALE[locale])}</td>
                    <td className="p-3 font-medium">{r.patient_name || '—'}{r.is_controlled && <ShieldAlert className="ms-1 inline h-3.5 w-3.5 text-destructive" />}</td>
                    <td className="p-3 text-muted-foreground">{r.doctor_name || '—'}</td>
                    <td className="p-3 text-muted-foreground" dir="ltr">{r.rx_number || '—'}</td>
                    <td className="p-3 text-center tabular-nums">{r.item_count}</td>
                    <td className="p-3 text-center"><Badge variant={variant}>{statusLabel}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
