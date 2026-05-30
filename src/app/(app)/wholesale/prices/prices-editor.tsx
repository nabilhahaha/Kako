'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Printer } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { setPrice } from '../actions';
import { useI18n } from '@/lib/i18n/provider';

export interface TierOpt { id: string; name: string }
export interface PriceRow { id: string; name: string; base: number; price: number | null }

const selectCls = 'h-10 rounded-md border border-input bg-background px-2 text-sm';

export function PricesEditor({ tiers, tierId, rows }: { tiers: TierOpt[]; tierId: string; rows: PriceRow[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [, startTransition] = useTransition();
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? rows.filter((r) => r.name.toLowerCase().includes(s)) : rows; }, [rows, q]);

  function save(productId: string, value: string) {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    startTransition(async () => {
      const res = await setPrice(tierId, productId, price);
      if (!res.ok) { toast.error(res.error ?? t('wholesale.errorGeneric')); return; }
      toast.success(t('wholesale.toastPriceSaved')); router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('wholesale.labelTierSelect')}</span>
          <select value={tierId} onChange={(e) => router.push(`/wholesale/prices?tier=${e.target.value}`)} className={selectCls}>
            {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
          </select>
          <Link href={`/print/wholesale/pricelist?tier=${tierId}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}><Printer className="h-4 w-4" /> {t('wholesale.btnPrintList')}</Link>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wholesale.placeholderSearchProduct')} className="w-60 pr-9" />
        </div>
      </div>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
            <th className="p-3 text-right font-medium">{t('wholesale.colProduct')}</th><th className="p-3 text-center font-medium">{t('wholesale.colBasePrice')}</th><th className="p-3 text-center font-medium">{t('wholesale.colTierPrice')}</th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-center text-muted-foreground tabular-nums" dir="ltr">{formatCurrency(r.base)}</td>
                <td className="p-3 text-center">
                  <Input type="number" min={0} step="0.01" dir="ltr" defaultValue={r.price ?? ''} placeholder={String(r.base)}
                    onBlur={(e) => { if (e.target.value !== '' && Number(e.target.value) !== r.price) save(r.id, e.target.value); }}
                    className="mx-auto h-8 w-28 text-center" />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{t('wholesale.emptyProducts')}</td></tr>}
          </tbody>
        </table></div>
      </CardContent></Card>
    </div>
  );
}
