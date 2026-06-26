'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ClipboardList, Receipt, Coins, ShoppingCart } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { getPosShiftSummary, type PosShiftSummary } from '../pos-orders-actions';

/** Shift summary — the cashier's own sales since midnight today (orders, revenue, items, and a
 *  by-method / by-mode breakdown). Read-only over the invoice ledger; never affects checkout. */
export function PosShift() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<PosShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPosShiftSummary();
    if (res.ok) setData(res.data);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const money = (n: number) => n.toFixed(2);
  const sinceLabel = data?.sinceIso
    ? new Date(data.sinceIso).toLocaleTimeString(locale === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('foodPosShift.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('foodPosShift.subtitle')}{data ? ` · ${data.cashierName}` : ''}{sinceLabel ? ` · ${t('foodPosShift.since')} ${sinceLabel}` : ''}
          </p>
        </div>
        <button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e7d6c2] bg-white px-3 text-sm font-medium">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> {t('foodPosShift.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="grid h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data || data.orders === 0 ? (
        <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-[#e7d6c2] bg-white/60 text-center text-sm text-muted-foreground">
          <div><ClipboardList className="mx-auto mb-2 h-7 w-7 opacity-40" />{t('foodPosShift.empty')}</div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={Receipt} label={t('foodPosShift.orders')} value={String(data.orders)} />
            <Kpi icon={Coins} label={t('foodPosShift.revenue')} value={money(data.revenue)} accent />
            <Kpi icon={Receipt} label={t('foodPosShift.avgTicket')} value={money(data.avgTicket)} />
            <Kpi icon={ShoppingCart} label={t('foodPosShift.items')} value={String(data.itemsSold)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Breakdown title={t('foodPosShift.byMethod')} rows={data.byMethod.map((m) => ({ label: t(`foodPosShift.${m.method === 'card' ? 'card' : m.method === 'mixed' ? 'mixed' : 'cash'}`), orders: m.orders, revenue: m.revenue }))} money={money} ordersLabel={t('foodPosShift.orders')} />
            <Breakdown title={t('foodPosShift.byMode')} rows={data.byMode.map((m) => ({ label: t(`foodPosShift.${m.mode === 'dine_in' ? 'dineIn' : m.mode === 'delivery' ? 'delivery' : 'takeaway'}`), orders: m.orders, revenue: m.revenue }))} money={money} ordersLabel={t('foodPosShift.orders')} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: typeof Receipt; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-2xl border bg-white p-3.5', accent ? 'border-primary/30 bg-primary/5' : 'border-[#e7d6c2]')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
      <div className={cn('mt-1.5 text-2xl font-extrabold tabular-nums', accent && 'text-primary')}>{value}</div>
    </div>
  );
}

function Breakdown({ title, rows, money, ordersLabel }: { title: string; rows: { label: string; orders: number; revenue: number }[]; money: (n: number) => string; ordersLabel: string }) {
  return (
    <div className="rounded-2xl border border-[#e7d6c2] bg-white p-4">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.label} <span className="text-xs">· {r.orders} {ordersLabel}</span></span>
            <span className="font-bold tabular-nums">{money(r.revenue)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
