import { Users, Store, ClipboardCheck, AlertCircle, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { SkeletonKPI } from '@/components/shared/SkeletonCard';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { ChartCard } from '@/components/analytics/ChartCard';
import { BarStatChart } from '@/components/analytics/BarStatChart';
import { useRegionalSnapshot } from '@/hooks/useRegional';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function RegionalDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const region = profile?.region ?? null;
  const snap = useRegionalSnapshot(region);

  const chartData = (snap.data?.byRegion ?? []).map((r) => ({
    region: r.region,
    'Coverage %': r.coverage_percent,
    'Customers': r.customers,
    'Visits (30d)': r.visits_30d,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أداء الإقليم${region ? ` — ${region}` : ''}`}
        description="مؤشرات استراتيجية لتغطية العملاء وأداء الفريق"
      />

      {snap.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonKPI key={i} />
          ))}
        </div>
      ) : snap.isError ? (
        <ErrorState
          message={(snap.error as Error)?.message}
          onRetry={() => snap.refetch()}
        />
      ) : !snap.data || snap.data.byRegion.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="لا توجد بيانات بعد"
          description="ستظهر المؤشرات هنا بمجرد إدخال العملاء والزيارات."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              icon={Store}
              label="العملاء"
              value={formatNumber(snap.data.totalCustomers)}
              hint="إجمالي العملاء المُغطّون"
              tone="info"
            />
            <KPICard
              icon={Users}
              label="المندوبون"
              value={formatNumber(snap.data.totalActiveReps)}
              hint="مندوبون نشطون"
              tone="success"
            />
            <KPICard
              icon={ClipboardCheck}
              label="زيارات 30 يوم"
              value={formatNumber(snap.data.visits30d)}
              hint="إجمالي الزيارات"
              tone="info"
            />
            <KPICard
              icon={AlertCircle}
              label="المتأخرات"
              value={formatCurrency(snap.data.totalOverdue)}
              hint="إجمالي المتأخرات المالية"
              tone="danger"
            />
          </section>

          <ChartCard
            title="أداء الأقاليم"
            description="مقارنة بين الأقاليم لآخر 30 يوم"
            height={320}
          >
            <BarStatChart
              data={chartData}
              xKey="region"
              series={[
                { key: 'Customers', label: 'العملاء' },
                { key: 'Visits (30d)', label: 'الزيارات' },
                { key: 'Coverage %', label: 'التغطية %' },
              ]}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}
