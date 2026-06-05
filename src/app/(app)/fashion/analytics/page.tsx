import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import {
  TrendingUp, CalendarRange, Wallet, Percent, CreditCard, Truck,
  PackageX, AlertTriangle, Clock, CalendarClock, Banknote, Snowflake, Undo2,
} from 'lucide-react';

interface Named { name: string; qty?: number; revenue?: number; ratio?: number }
interface Analytics {
  sales_today: number; sales_month: number; gross_profit: number;
  installment_sales: number; cash_sales: number; returns_month: number; return_rate: number;
  purchases_month: number; collected_month: number; collection_rate: number;
  alerts: { low_stock: number; out_of_stock: number; due_today: number; overdue: number; negative_cashbox: number; slow_moving: number; high_returns: number };
  top_products: Named[]; top_customers: Named[]; slow_moving: Named[]; high_returns: Named[];
}

export default async function RetailAnalyticsPage() {
  await requirePermission('fashion.reports');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const currency = ctx.company?.currency || 'EGP';
  const money = (n: number) => formatCurrency(Number(n) || 0, currency, intl);

  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_retail_analytics');
  const a = (data as Analytics) ?? null;

  if (!a) {
    return (
      <div>
        <PageHeader title={t('fashion.analytics.title')} description={t('fashion.analytics.description')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p>
      </div>
    );
  }

  const cashShare = a.cash_sales + a.installment_sales > 0
    ? Math.round((a.cash_sales / (a.cash_sales + a.installment_sales)) * 100) : 0;

  // Alerts (warning/destructive only when there is something to act on).
  const alerts: { key: string; n: number; tone: 'warning' | 'destructive'; icon: typeof PackageX; href?: string }[] = [
    { key: 'lowStock', n: a.alerts.low_stock, tone: 'warning', icon: AlertTriangle, href: '/inventory' },
    { key: 'outOfStock', n: a.alerts.out_of_stock, tone: 'destructive', icon: PackageX, href: '/inventory' },
    { key: 'dueToday', n: a.alerts.due_today, tone: 'warning', icon: CalendarClock, href: '/fashion/installments' },
    { key: 'overdue', n: a.alerts.overdue, tone: 'destructive', icon: Clock, href: '/fashion/installments' },
    { key: 'slowMoving', n: a.alerts.slow_moving, tone: 'warning', icon: Snowflake, href: '/inventory/movements' },
    { key: 'highReturns', n: a.alerts.high_returns, tone: 'warning', icon: Undo2, href: '/sales/returns' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('fashion.analytics.title')} description={t('fashion.analytics.description')} />

      {/* Operational alerts */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('fashion.analytics.alertsHeading')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Number(a.alerts.negative_cashbox) < 0 && (
            <StatCard label={t('fashion.analytics.negativeCashbox')} value={money(a.alerts.negative_cashbox)} icon={Banknote} tone="destructive" href="/fashion/cashbox" />
          )}
          {alerts.map((al) => (
            <StatCard key={al.key} label={t(`fashion.analytics.${al.key}` as 'fashion.analytics.lowStock')}
              value={formatNumber(al.n, intl)} icon={al.icon} tone={al.n > 0 ? al.tone : 'info'} href={al.href} />
          ))}
        </div>
      </section>

      {/* KPIs */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('fashion.analytics.kpisHeading')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label={t('fashion.analytics.salesToday')} value={money(a.sales_today)} icon={TrendingUp} tone="primary" />
          <StatCard label={t('fashion.analytics.salesMonth')} value={money(a.sales_month)} icon={CalendarRange} tone="primary" />
          <StatCard label={t('fashion.analytics.grossProfit')} value={money(a.gross_profit)} icon={Wallet} tone="success" />
          <StatCard label={t('fashion.analytics.returnRate')} value={`${formatNumber(a.return_rate, intl)}%`} icon={Percent} tone={a.return_rate > 10 ? 'warning' : 'info'} />
          <StatCard label={t('fashion.analytics.collectionRate')} value={`${formatNumber(a.collection_rate, intl)}%`} icon={Percent} tone={a.collection_rate < 70 ? 'warning' : 'success'} />
          <StatCard label={t('fashion.analytics.cashShare')} value={`${formatNumber(cashShare, intl)}%`} icon={CreditCard} tone="info" hint={`${money(a.cash_sales)} / ${money(a.installment_sales)}`} />
          <StatCard label={t('fashion.analytics.purchases')} value={money(a.purchases_month)} icon={Truck} tone="info" />
          <StatCard label={t('fashion.analytics.collected')} value={money(a.collected_month)} icon={Banknote} tone="success" />
        </div>
      </section>

      {/* Top lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title={t('fashion.analytics.topProducts')} rows={a.top_products} render={(r) => money(r.revenue ?? 0)} empty={t('fashion.analytics.noData')} />
        <ListCard title={t('fashion.analytics.topCustomers')} rows={a.top_customers} render={(r) => money(r.revenue ?? 0)} empty={t('fashion.analytics.noData')} />
        <ListCard title={t('fashion.analytics.slowMovingList')} rows={a.slow_moving} render={(r) => `${formatNumber(r.qty ?? 0, intl)}`} empty={t('fashion.analytics.noData')} />
        <ListCard title={t('fashion.analytics.highReturnsList')} rows={a.high_returns} render={(r) => `${formatNumber(r.ratio ?? 0, intl)}%`} empty={t('fashion.analytics.noData')} />
      </div>
    </div>
  );
}

function ListCard({ title, rows, render, empty }: { title: string; rows: Named[]; render: (r: Named) => string; empty: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="border-b p-3 text-sm font-semibold">{title}</h3>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 truncate">{i + 1}. {r.name}</span>
                <span className="tabular-nums font-medium" dir="ltr">{render(r)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
