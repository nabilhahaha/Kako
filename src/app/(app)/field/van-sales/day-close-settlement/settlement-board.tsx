'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HandCoins, Boxes, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { settleDayCash, reconcileDayStock, type SettlementBoardRow } from '@/lib/van-sales/day-close-server';

const SETTLE_TONE: Record<string, 'warning' | 'destructive' | 'success'> = { pending: 'destructive', partial: 'warning', settled: 'success' };

/** Settlement & custody board: per request, record a cash settlement (full/partial)
 *  and/or a stock count — even after the day is closed. Header shows Outstanding Cash
 *  by salesman. */
export function SettlementBoard({ rows, canSettle, canReconcile }: { rows: SettlementBoardRow[]; canSettle: boolean; canReconcile: boolean }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [list, setList] = useState(rows);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [count, setCount] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>('');
  const sl = (k: string) => t(`vanSales.settlement.${k}`);

  // Outstanding cash by salesman (custody owed).
  const bySalesman = useMemo(() => {
    const m = new Map<string, { name: string; outstanding: number }>();
    for (const r of list) {
      const e = m.get(r.salesmanId) ?? { name: r.salesmanName, outstanding: 0 };
      e.outstanding += r.outstandingCash;
      m.set(r.salesmanId, e);
    }
    return [...m.values()].filter((x) => x.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  }, [list]);

  const totalOutstanding = bySalesman.reduce((s, x) => s + x.outstanding, 0);

  async function doSettle(r: SettlementBoardRow) {
    const amt = Number(amount[r.id] ?? '');
    if (!(amt > 0)) { toast.error(sl('enterAmount')); return; }
    setBusy(r.id + ':settle');
    try {
      const res = await settleDayCash({ requestId: r.id, settledAmount: amt });
      if (!res.ok || !res.data) { toast.error(res.error ?? sl('error')); return; }
      const data = res.data;
      setList((l) => l.map((x) => (x.id === r.id ? { ...x, settledCash: x.settledCash + amt, outstandingCash: data.outstanding, settlementStatus: data.settlementStatus } : x))
        .filter((x) => !(x.settlementStatus === 'settled' && (x.reconcileStatus !== 'pending'))));
      setAmount((m) => ({ ...m, [r.id]: '' }));
      toast.success(sl('settledToast'));
    } finally { setBusy(''); }
  }

  async function doCount(r: SettlementBoardRow) {
    const c = Number(count[r.id] ?? '');
    if (!(count[r.id]?.trim())) { toast.error(sl('enterCount')); return; }
    setBusy(r.id + ':count');
    try {
      const res = await reconcileDayStock({ requestId: r.id, countedStock: c });
      if (!res.ok || !res.data) { toast.error(res.error ?? sl('error')); return; }
      setList((l) => l.map((x) => (x.id === r.id ? { ...x, reconcileStatus: 'reconciled', countedStock: c, stockVariance: res.data!.variance } : x))
        .filter((x) => !(x.reconcileStatus === 'reconciled' && !['pending', 'partial'].includes(x.settlementStatus))));
      setCount((m) => ({ ...m, [r.id]: '' }));
      toast.success(sl('countedToast'));
    } finally { setBusy(''); }
  }

  return (
    <div className="space-y-4">
      {/* Outstanding cash by salesman */}
      {bySalesman.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{sl('outstandingBySalesman')}</h2>
              <span className="text-sm font-bold tabular-nums text-destructive" dir="ltr">{formatCurrency(totalOutstanding, 'EGP', intl)}</span>
            </div>
            <ul className="divide-y text-sm">
              {bySalesman.map((s) => (
                <li key={s.name} className="flex items-center justify-between py-1.5">
                  <span className="truncate">{s.name}</span>
                  <span className="tabular-nums font-medium" dir="ltr">{formatCurrency(s.outstanding, 'EGP', intl)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {list.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">{sl('empty')}</CardContent></Card>
      ) : (
        list.map((r) => {
          const needsSettle = ['pending', 'partial'].includes(r.settlementStatus);
          const needsCount = r.reconcileStatus === 'pending';
          return (
            <Card key={r.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.salesmanName}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{r.workDate ?? '—'} · {sl(`day_${r.dayStatus}`) || r.dayStatus}</div>
                  </div>
                  <Badge variant={SETTLE_TONE[r.settlementStatus] ?? 'secondary'}>{sl(`set_${r.settlementStatus}`)}</Badge>
                </div>

                {/* Cash settlement */}
                {canSettle && needsSettle && (
                  <div className="space-y-2 rounded-md border p-2.5">
                    <div className="grid grid-cols-3 gap-2 text-xs" dir="ltr">
                      <Stat label={sl('expected')} value={formatCurrency(r.expectedCash, 'EGP', intl)} />
                      <Stat label={sl('settled')} value={formatCurrency(r.settledCash, 'EGP', intl)} />
                      <Stat label={sl('outstanding')} value={formatCurrency(r.outstandingCash, 'EGP', intl)} danger />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">{sl('settleNow')}</Label>
                        <Input type="number" inputMode="decimal" value={amount[r.id] ?? ''} onChange={(e) => setAmount((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="0" />
                      </div>
                      <Button disabled={busy !== ''} onClick={() => doSettle(r)}>
                        {busy === r.id + ':settle' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><HandCoins className="h-4 w-4" /> {sl('recordSettle')}</>}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Inventory count */}
                {canReconcile && needsCount && (
                  <div className="space-y-2 rounded-md border p-2.5">
                    <div className="grid grid-cols-2 gap-2 text-xs" dir="ltr">
                      <Stat label={sl('expectedStock')} value={String(r.expectedStock ?? 0)} />
                      <Stat label={sl('reconcileStatus')} value={sl(`rec_${r.reconcileStatus}`)} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">{sl('countedStock')}</Label>
                        <Input type="number" inputMode="decimal" value={count[r.id] ?? ''} onChange={(e) => setCount((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="0" />
                      </div>
                      <Button variant="outline" disabled={busy !== ''} onClick={() => doCount(r)}>
                        {busy === r.id + ':count' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Boxes className="h-4 w-4" /> {sl('recordCount')}</>}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${danger ? 'text-destructive' : ''}`}>{value}</div>
    </div>
  );
}
