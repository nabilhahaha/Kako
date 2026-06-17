import Link from 'next/link';
import { AlertTriangle, ShieldAlert, Wallet } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadMyCashCustody } from '@/lib/van-sales/day-close-server';

/**
 * Today custody summary: a small card so the salesman immediately sees if he is
 * carrying unresolved cash from previous days. Warning badge when outstanding > 0;
 * escalation badge when the oldest outstanding is older than the company threshold.
 * Renders nothing when there is no custody activity to show.
 */
export async function CashCustodyCard() {
  const res = await loadMyCashCustody();
  if (!res.ok || !res.data) return null;
  const c = res.data;
  // Show only when there is something held or outstanding (avoid empty noise).
  if (c.totalCashHeld <= 0 && c.outstandingCash <= 0) return null;

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const cur = (n: number) => formatCurrency(n, 'EGP', intl);
  const cl = (k: string, params?: Record<string, string | number>) => t(`vanSales.custody.${k}`, params);
  const escalated = c.outstandingCash > 0 && c.oldestOutstandingDays != null && c.oldestOutstandingDays > c.escalationDays;

  return (
    <Link href="/field/van-sales/cash-custody" className="block">
      <Card className="transition-colors hover:bg-secondary/40">
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> {cl('title')}</span>
            {escalated ? (
              <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" /> {cl('escalated', { days: c.oldestOutstandingDays ?? 0 })}</Badge>
            ) : c.outstandingCash > 0 ? (
              <Badge variant="warning" className="gap-1"><AlertTriangle className="h-3 w-3" /> {cl('hasOutstanding')}</Badge>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" dir="ltr">
            <Row label={cl('inCustodyPrev')} value={cur(c.cashInCustodyPrevious)} />
            <Row label={cl('todaysCollections')} value={cur(c.todaysCollections)} />
            <Row label={cl('totalHeld')} value={cur(c.totalCashHeld)} strong />
            <Row label={cl('settledToday')} value={cur(c.settledToday)} />
            <Row label={cl('outstanding')} value={cur(c.outstandingCash)} strong danger={c.outstandingCash > 0} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${danger ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  );
}
