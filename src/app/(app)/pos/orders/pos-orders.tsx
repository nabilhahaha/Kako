'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ReceiptText, UtensilsCrossed, ShoppingBag, Bike } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { getPosRecentOrders, type PosOrderRow } from '../pos-orders-actions';

const MODE_ICON: Record<string, typeof UtensilsCrossed> = { dine_in: UtensilsCrossed, takeaway: ShoppingBag, delivery: Bike };

/** Recent POS orders (read-only) — the cashier's quick view of the latest tickets they and the
 *  outlet rang up. Reads the immutable invoice ledger; no writes, no checkout impact. */
export function PosOrders() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<PosOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPosRecentOrders(50);
    if (res.ok) setRows(res.data);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fmtTime = (iso: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(locale === 'ar' ? 'ar' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso.slice(0, 16).replace('T', ' '); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('foodPosOrders.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('foodPosOrders.subtitle')}</p>
        </div>
        <button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e7d6c2] bg-white px-3 text-sm font-medium">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> {t('foodPosOrders.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="grid h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-[#e7d6c2] bg-white/60 text-center text-sm text-muted-foreground">
          <div><ReceiptText className="mx-auto mb-2 h-7 w-7 opacity-40" />{t('foodPosOrders.empty')}</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e7d6c2] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#faf1e6] text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t('foodPosOrders.number')}</th>
                <th className="px-3 py-2 text-start font-semibold">{t('foodPosOrders.time')}</th>
                <th className="px-3 py-2 text-start font-semibold">{t('foodPosOrders.mode')}</th>
                <th className="px-3 py-2 text-start font-semibold">{t('foodPosOrders.method')}</th>
                <th className="px-3 py-2 text-end font-semibold">{t('foodPosOrders.total')}</th>
                <th className="px-3 py-2 text-center font-semibold">{t('foodPosOrders.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e4d4]">
              {rows.map((r) => {
                const Icon = MODE_ICON[r.orderType ?? 'takeaway'] ?? ShoppingBag;
                const voided = r.status === 'voided' || r.docType === 'credit_note';
                return (
                  <tr key={r.id} className={cn('hover:bg-[#faf1e6]', voided && 'opacity-60')}>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{r.invoiceNumber || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtTime(r.issueAt)}</td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5"><Icon className="h-4 w-4 text-muted-foreground" /> {t(`foodPosOrders.mode_${r.orderType ?? 'takeaway'}`)}</span></td>
                    <td className="px-3 py-2.5">{t(`foodPosOrders.method_${r.paymentMethod ?? 'cash'}`)}</td>
                    <td className="px-3 py-2.5 text-end font-bold tabular-nums">{r.grandTotal.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        voided ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>
                        {voided ? t('foodPosOrders.status_voided') : t('foodPosOrders.status_issued')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
