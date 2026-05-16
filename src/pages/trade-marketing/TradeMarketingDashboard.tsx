import { Megaphone, TrendingUp, Store, Package2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { SkeletonKPI } from '@/components/shared/SkeletonCard';
import { ErrorState } from '@/components/shared/ErrorState';
import { ChartCard, CHART_PALETTE } from '@/components/analytics/ChartCard';
import { BarStatChart } from '@/components/analytics/BarStatChart';
import { PieStatChart } from '@/components/analytics/PieStatChart';
import { Card } from '@/components/ui/card';
import { useChannelStats, useNearExpiryAnalytics } from '@/hooks/useRegional';
import { usePromotions } from '@/hooks/usePromotions';
import { formatCurrency, formatNumber } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  active: CHART_PALETTE.success,
  paused: CHART_PALETTE.warning,
  draft: CHART_PALETTE.muted,
  completed: CHART_PALETTE.info,
  cancelled: CHART_PALETTE.danger,
};

export function TradeMarketingDashboard() {
  const channelsQ = useChannelStats();
  const promosQ = usePromotions();
  const neQ = useNearExpiryAnalytics();

  const channelBars = (channelsQ.data ?? []).map((c) => ({
    channel: c.channel,
    'العملاء': c.customers,
    'الزيارات': c.visits_30d,
  }));

  const promoCounts = (promosQ.data ?? []).reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const promoPie = Object.entries(promoCounts).map(([name, value]) => ({
    name,
    value,
    color: STATUS_COLORS[name],
  }));

  const activePromos = (promosQ.data ?? []).filter((p) => p.status === 'active').length;
  const totalSpend = (promosQ.data ?? []).reduce(
    (s, p) => s + Number(p.trade_spend ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التسويق التجاري"
        description="نظرة عامة على العروض، التغطية، وفقد المنتجات"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {promosQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)
        ) : (
          <>
            <KPICard
              icon={Megaphone}
              label="عروض نشطة"
              value={formatNumber(activePromos)}
              hint={`من إجمالي ${formatNumber(promosQ.data?.length ?? 0)}`}
              tone="success"
            />
            <KPICard
              icon={TrendingUp}
              label="إنفاق تجاري"
              value={formatCurrency(totalSpend)}
              hint="إجمالي تكلفة العروض"
              tone="info"
            />
            <KPICard
              icon={Store}
              label="القنوات"
              value={formatNumber(channelsQ.data?.length ?? 0)}
              hint="قنوات نشطة"
              tone="info"
            />
            <KPICard
              icon={Package2}
              label="كمية بالخطر"
              value={formatNumber(neQ.data?.atRiskQuantity ?? 0)}
              hint="منتجات قارب على الانتهاء"
              tone="warning"
            />
          </>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="أداء القنوات" description="آخر 30 يوم">
          {channelsQ.isLoading ? (
            <div className="flex h-full items-center justify-center text-caption">
              جاري التحميل...
            </div>
          ) : channelsQ.isError ? (
            <ErrorState onRetry={() => channelsQ.refetch()} />
          ) : (
            <BarStatChart
              data={channelBars}
              xKey="channel"
              series={[
                { key: 'العملاء', label: 'العملاء' },
                { key: 'الزيارات', label: 'الزيارات' },
              ]}
            />
          )}
        </ChartCard>

        <ChartCard title="حالة العروض" description="توزيع حسب الحالة">
          {promosQ.isLoading ? (
            <div className="flex h-full items-center justify-center text-caption">
              جاري التحميل...
            </div>
          ) : promoPie.length === 0 ? (
            <div className="flex h-full items-center justify-center text-caption">
              لا توجد عروض بعد
            </div>
          ) : (
            <PieStatChart data={promoPie} />
          )}
        </ChartCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/trade-marketing/promotions" className="group">
          <Card className="flex items-center gap-3 p-4 transition-all hover:border-primary/40 hover:shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <span className="font-medium text-foreground">تقويم العروض</span>
          </Card>
        </Link>
        <Link to="/trade-marketing/listings" className="group">
          <Card className="flex items-center gap-3 p-4 transition-all hover:border-primary/40 hover:shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <span className="font-medium text-foreground">تقارير القنوات</span>
          </Card>
        </Link>
        <Link to="/trade-marketing/near-expiry" className="group">
          <Card className="flex items-center gap-3 p-4 transition-all hover:border-primary/40 hover:shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package2 className="h-5 w-5" />
            </div>
            <span className="font-medium text-foreground">تحليل الفقد</span>
          </Card>
        </Link>
      </section>
    </div>
  );
}
