import { Package2, AlertTriangle, ShieldCheck, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { SkeletonKPI } from '@/components/shared/SkeletonCard';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { ChartCard, CHART_PALETTE } from '@/components/analytics/ChartCard';
import { LineStatChart } from '@/components/analytics/LineStatChart';
import { PieStatChart } from '@/components/analytics/PieStatChart';
import { useNearExpiryAnalytics } from '@/hooks/useRegional';
import { formatNumber } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  pending: CHART_PALETTE.warning,
  supervisor_approved: CHART_PALETTE.info,
  approved: CHART_PALETTE.success,
  rejected: CHART_PALETTE.danger,
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار',
  supervisor_approved: 'مشرف اعتمد',
  approved: 'معتمد نهائي',
  rejected: 'مرفوض',
};

export function NearExpiryAnalyticsPage() {
  const { data, isLoading, isError, error, refetch } = useNearExpiryAnalytics();

  const monthly = (data?.byMonth ?? []).map((m) => ({
    month: m.month,
    'العدد': m.count,
    'الكمية': m.quantity,
  }));

  const pieData = (data?.byStatus ?? []).map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: s.count,
    color: STATUS_COLORS[s.status],
  }));

  const approved =
    data?.byStatus.find((s) => s.status === 'approved')?.count ?? 0;
  const rejected =
    data?.byStatus.find((s) => s.status === 'rejected')?.count ?? 0;
  const pending =
    (data?.byStatus.find((s) => s.status === 'pending')?.count ?? 0) +
    (data?.byStatus.find((s) => s.status === 'supervisor_approved')?.count ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحليل الفقد وقارب على الانتهاء"
        description="تتبّع المنتجات المعرضة للفقد والوقاية"
        back="/trade-marketing"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)
        ) : (
          <>
            <KPICard
              icon={Package2}
              label="إجمالي التسجيلات"
              value={formatNumber(data?.total ?? 0)}
              tone="info"
            />
            <KPICard
              icon={AlertTriangle}
              label="كمية بالخطر"
              value={formatNumber(data?.atRiskQuantity ?? 0)}
              tone="warning"
              hint="بانتظار الاعتماد"
            />
            <KPICard
              icon={ShieldCheck}
              label="معتمد"
              value={formatNumber(approved)}
              tone="success"
            />
            <KPICard
              icon={XCircle}
              label="مرفوض"
              value={formatNumber(rejected)}
              tone="danger"
              hint={`بانتظار: ${formatNumber(pending)}`}
            />
          </>
        )}
      </section>

      {isError ? (
        <ErrorState
          message={(error as Error)?.message}
          onRetry={() => refetch()}
        />
      ) : !data || data.total === 0 ? (
        <EmptyState
          icon={Package2}
          title="لا توجد بيانات بعد"
          description="ستظهر التحليلات هنا بمجرد تسجيل منتجات قاربت على الانتهاء."
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="الاتجاه الشهري" description="عدد التسجيلات والكميات">
            <LineStatChart
              data={monthly}
              xKey="month"
              series={[
                { key: 'العدد', label: 'العدد' },
                { key: 'الكمية', label: 'الكمية' },
              ]}
            />
          </ChartCard>

          <ChartCard title="توزيع الحالات">
            <PieStatChart data={pieData} />
          </ChartCard>
        </section>
      )}
    </div>
  );
}
