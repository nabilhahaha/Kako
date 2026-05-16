import { useState } from 'react';
import { Store } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { ChartCard } from '@/components/analytics/ChartCard';
import { BarStatChart } from '@/components/analytics/BarStatChart';
import { useChannelStats } from '@/hooks/useRegional';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';

const CHANNELS = ['الكل', 'TT', 'WS', 'DS', 'MT', 'SW'];

export function ListingReportsPage() {
  const [filter, setFilter] = useState<string>('الكل');
  const { data, isLoading, isError, error, refetch } = useChannelStats();

  const filtered = data?.filter((d) => filter === 'الكل' || d.channel === filter) ?? [];

  const chartData = filtered.map((c) => ({
    channel: c.channel,
    'العملاء': c.customers,
    'الزيارات': c.visits_30d,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقارير التغطية والقنوات"
        description="عرض حسب القناة (TT / WS / DS / MT / SW)"
        back="/trade-marketing"
      />

      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === c
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      ) : !filtered.length ? (
        <EmptyState
          icon={Store}
          title="لا توجد بيانات للقناة المختارة"
          description="جرّب اختيار قناة أخرى أو 'الكل'."
        />
      ) : (
        <>
          <ChartCard title="مقارنة القنوات" height={300}>
            <BarStatChart
              data={chartData}
              xKey="channel"
              series={[
                { key: 'العملاء', label: 'العملاء' },
                { key: 'الزيارات', label: 'الزيارات (30 يوم)' },
              ]}
            />
          </ChartCard>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-start font-medium">القناة</th>
                    <th className="px-5 py-3 text-end font-medium">العملاء</th>
                    <th className="px-5 py-3 text-end font-medium">الزيارات (30 يوم)</th>
                    <th className="px-5 py-3 text-end font-medium">إجمالي المديونية</th>
                    <th className="px-5 py-3 text-end font-medium">المتأخرات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => (
                    <tr key={c.channel} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium text-foreground">{c.channel}</td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(c.customers)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatNumber(c.visits_30d)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums">
                        {formatCurrency(c.total_debt)}
                      </td>
                      <td className="px-5 py-3 text-end tabular-nums text-destructive">
                        {formatCurrency(c.overdue_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
