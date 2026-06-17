'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import { stockStatus } from '@/lib/erp/stock-risk';
import type { StockMovementRow, StockMovementTotals } from '@/lib/van-sales/stock-movement';

// Risk dot carried over from the old Truck Stock screen (out = red, low = amber)
// so the movement report keeps the at-a-glance availability signal.
const RISK_DOT: Record<'out' | 'low', string> = { out: 'bg-destructive', low: 'bg-warning' };
function RiskDot({ current }: { current: number }) {
  const s = stockStatus(current);
  if (s === 'ok') return null;
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${RISK_DOT[s]}`} aria-hidden />;
}

// Searchable, mobile-friendly van stock-movement report. SKU rows are clickable
// (open the per-SKU movement detail in a new tab so the report — and its search —
// stays put). Sorted by SKU (server-side); search filters by name/code.
export function StockMovementTable({
  rows, totals, detailBase,
}: {
  rows: StockMovementRow[];
  totals: StockMovementTotals;
  detailBase: string;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term));
  }, [rows, q]);

  const num = (n: number) => (n === 0 ? '—' : n.toLocaleString());
  const L = (k: string) => t(`vanSales.stockMove.${k}`);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('search')} className="ps-9" />
      </div>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{L('empty')}</p>
        ) : (
          <>
            {/* Mobile: one card per SKU with the full breakdown. */}
            <ul className="divide-y sm:hidden">
              {filtered.map((r) => (
                <li key={r.productId} className="p-3">
                  <a href={`${detailBase}/${r.productId}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-primary underline underline-offset-2"><RiskDot current={r.current} />{r.name}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums" dir="ltr">{r.current.toLocaleString()}</span>
                  </a>
                  <div className="mt-1 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground" dir="ltr">
                    <span>{L('opening')}: {num(r.opening)}</span>
                    <span>{L('load')}: {num(r.load)}</span>
                    <span>{L('sales')}: {num(r.sales)}</span>
                    <span>{L('saleableReturn')}: {num(r.saleableReturn)}</span>
                    <span>{L('damageReturn')}: {num(r.damageReturn)}</span>
                    <span>{L('expiry')}: {num(r.expiry)}</span>
                    <span>{L('adjustment')}: {num(r.adjustment)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop: full movement table. */}
            <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                <th className="p-2 text-start font-medium">{L('sku')}</th>
                <th className="p-2 text-end font-medium">{L('opening')}</th>
                <th className="p-2 text-end font-medium">{L('load')}</th>
                <th className="p-2 text-end font-medium">{L('sales')}</th>
                <th className="p-2 text-end font-medium">{L('saleableReturn')}</th>
                <th className="p-2 text-end font-medium">{L('damageReturn')}</th>
                <th className="p-2 text-end font-medium">{L('expiry')}</th>
                <th className="p-2 text-end font-medium">{L('adjustment')}</th>
                <th className="p-2 text-end font-medium">{L('current')}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.productId} className="border-b last:border-0">
                    <td className="p-2"><a href={`${detailBase}/${r.productId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary underline underline-offset-2"><RiskDot current={r.current} />{r.name}</a></td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">{num(r.opening)}</td>
                    <td className="p-2 text-end tabular-nums text-success" dir="ltr">{num(r.load)}</td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">{num(r.sales)}</td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">{num(r.saleableReturn)}</td>
                    <td className="p-2 text-end tabular-nums text-destructive" dir="ltr">{num(r.damageReturn)}</td>
                    <td className="p-2 text-end tabular-nums text-destructive" dir="ltr">{num(r.expiry)}</td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">{num(r.adjustment)}</td>
                    <td className="p-2 text-end font-bold tabular-nums" dir="ltr">{r.current.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 font-bold">
                <tr>
                  <td className="p-2">{L('total')}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.opening)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.load)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.sales)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.saleableReturn)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.damageReturn)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.expiry)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(totals.adjustment)}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{totals.current.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table></div>
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
