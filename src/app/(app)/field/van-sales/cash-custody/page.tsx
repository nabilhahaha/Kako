import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { loadMyCashCustody } from '@/lib/van-sales/day-close-server';

export const dynamic = 'force-dynamic';

// Salesman cash custody: carried outstanding (prior days) + today's collections −
// settled today = outstanding. Outstanding is a custody balance the rep still owes,
// shown separately from operational opening cash. Read-only; gated by field.sales.
export default async function CashCustodyPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'sales.collect') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const cur = (n: number) => formatCurrency(n, 'EGP', intl);
  const res = await loadMyCashCustody();
  const cc = res.ok ? res.data! : null;
  const cl = (k: string) => t(`vanSales.custody.${k}`);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <PageHeader title={cl('title')} description={cl('subtitle')} />
      {!cc ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.ok ? '' : res.error}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="space-y-1 pt-6" dir="ltr">
            <Row label={cl('inCustodyPrev')} value={cur(cc.cashInCustodyPrevious)} />
            <Row label={cl('todaysCollections')} value={cur(cc.todaysCollections)} />
            <Row label={cl('totalHeld')} value={cur(cc.totalCashHeld)} strong border />
            <Row label={cl('settledToday')} value={cur(cc.settledToday)} tone="success" />
            <Row label={cl('outstanding')} value={cur(cc.outstandingCash)} strong tone={cc.outstandingCash > 0 ? 'destructive' : 'success'} border />
            <div className="pt-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between"><span>{cl('lastSettlementDate')}</span><span>{cc.lastSettlementDate ?? '—'}</span></div>
              <div className="flex items-center justify-between"><span>{cl('lastSettlementAmount')}</span><span className="tabular-nums">{cc.lastSettlementAmount != null ? cur(cc.lastSettlementAmount) : '—'}</span></div>
            </div>
          </CardContent>
        </Card>
      )}
      {cc && cc.outstandingCash > 0 && (
        <p className="px-1 text-xs text-muted-foreground">{cl('note')}</p>
      )}
    </div>
  );
}

function Row({ label, value, strong, border, tone }: { label: string; value: string; strong?: boolean; border?: boolean; tone?: 'success' | 'destructive' }) {
  const toneCls = tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : '';
  return (
    <div className={`flex items-center justify-between py-1.5 ${border ? 'border-t mt-1 pt-2' : ''}`}>
      <span className={`text-sm ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm'} ${toneCls}`}>{value}</span>
    </div>
  );
}
