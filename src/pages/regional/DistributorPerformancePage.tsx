import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { ChartCard } from '@/components/analytics/ChartCard';
import { BarStatChart } from '@/components/analytics/BarStatChart';
import { useRegionalSnapshot } from '@/hooks/useRegional';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function DistributorPerformancePage() {
  const profile = useAuthStore((s) => s.profile);
  const region = profile?.region ?? null;
  const snap = useRegionalSnapshot(region);

  const chartData = (snap.data?.byRegion ?? []).map((r) => ({
    region: r.region,
    'تغطية %': r.coverage_percent,
    'متأخرات': r.overdue_count,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="أداء الموزّع — Relia"
        description="مقاييس التغطية والديون والأداء عبر الأقاليم"
        back="/regional"
      />

      {snap.isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : snap.isError ? (
        <ErrorState
          message={(snap.error as Error)?.message}
          onRetry={() => snap.refetch()}
        />
      ) : (
        <>
          <ChartCard title="التغطية مقابل المتأخرات" height={300}>
            <BarStatChart
              data={chartData}
              xKey="region"
              series={[
                { key: 'تغطية %', label: 'تغطية %' },
                { key: 'متأخرات', label: 'عملاء بمتأخرات' },
              ]}
            />
          </ChartCard>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border p-5">
              <h3 className="text-h3 text-foreground">جدول تفصيلي</h3>
              <p className="text-caption">آخر 30 يوم</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-start font-medium">الإقليم</th>
                    <th className="px-5 py-3 text-end font-medium">العملاء</th>
                    <th className="px-5 py-3 text-end font-medium">نشطون</th>
                    <th className="px-5 py-3 text-end font-medium">التغطية</th>
                    <th className="px-5 py-3 text-end font-medium">الزيارات</th>
                    <th className="px-5 py-3 text-end font-medium">متأخرات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(snap.data?.byRegion ?? []).map((r) => (
                    <tr key={r.region} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium text-foreground">{r.region}</td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(r.customers)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(r.active_customers)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {r.coverage_percent}%
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(r.visits_30d)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums text-destructive">
                        {formatNumber(r.overdue_count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {snap.data && (
                  <tfoot className="bg-muted/30 text-sm font-medium">
                    <tr>
                      <td className="px-5 py-3">الإجمالي</td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(snap.data.totalCustomers)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">—</td>
                      <td className="px-5 py-3 text-end tabular-nums">—</td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(snap.data.visits30d)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums text-destructive">
                        {formatCurrency(snap.data.totalOverdue)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
