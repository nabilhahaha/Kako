import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Users,
  Store,
  Wallet,
  AlertTriangle,
  ShieldCheck,
  Package2,
  DollarSign,
  Download,
  Loader2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkeletonKPI } from '@/components/shared/SkeletonCard';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChartCard } from '@/components/analytics/ChartCard';
import { LineStatChart } from '@/components/analytics/LineStatChart';
import { useExecutiveKPIs, useDailyVisitTrend, useAnomalies } from '@/hooks/useExecutive';
import { useAuthStore } from '@/stores/authStore';
import { exportExecutivePPTX } from '@/lib/pptx';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import type { ExecutiveKPIs } from '@/lib/types';

interface KpiSpec {
  key: keyof ExecutiveKPIs;
  label: string;
  icon: typeof TrendingUp;
  tone: 'default' | 'success' | 'warning' | 'danger' | 'info';
  format: (v: number) => string;
  comparePrevKey?: keyof ExecutiveKPIs;
  drilldown?: string;
}

const KPI_SPECS: KpiSpec[] = [
  {
    key: 'totalRevenue30d',
    label: 'الإيرادات (30 يوم)',
    icon: DollarSign,
    tone: 'success',
    format: formatCurrency,
    comparePrevKey: 'totalRevenuePrev30d',
  },
  {
    key: 'totalVisits30d',
    label: 'الزيارات (30 يوم)',
    icon: TrendingUp,
    tone: 'info',
    format: (v) => formatNumber(v),
    comparePrevKey: 'totalVisitsPrev30d',
  },
  {
    key: 'coveragePercent',
    label: 'التغطية',
    icon: Store,
    tone: 'info',
    format: (v) => `${v}%`,
  },
  {
    key: 'totalReps',
    label: 'مندوبون نشطون',
    icon: Users,
    tone: 'default',
    format: (v) => formatNumber(v),
  },
  {
    key: 'totalCustomers',
    label: 'إجمالي العملاء',
    icon: Store,
    tone: 'default',
    format: formatNumber,
  },
  {
    key: 'totalOverdue',
    label: 'إجمالي المتأخرات',
    icon: Wallet,
    tone: 'danger',
    format: formatCurrency,
  },
  {
    key: 'pendingApprovals',
    label: 'موافقات معلّقة',
    icon: ShieldCheck,
    tone: 'warning',
    format: formatNumber,
  },
  {
    key: 'atRiskQuantity',
    label: 'كمية بالخطر',
    icon: Package2,
    tone: 'warning',
    format: formatNumber,
  },
];

export function ExecutiveDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const kpisQ = useExecutiveKPIs();
  const trendQ = useDailyVisitTrend(30);
  const { anomalies, isLoading: anomaliesLoading } = useAnomalies();

  const [drilldown, setDrilldown] = useState<KpiSpec | null>(null);
  const [exporting, setExporting] = useState(false);

  const lastUpdate = useMemo(
    () =>
      kpisQ.dataUpdatedAt
        ? new Date(kpisQ.dataUpdatedAt).toLocaleTimeString('ar-SA')
        : '—',
    [kpisQ.dataUpdatedAt],
  );

  async function handleExport() {
    if (!kpisQ.data) {
      toast.error('انتظر اكتمال تحميل البيانات');
      return;
    }
    setExporting(true);
    try {
      await exportExecutivePPTX({
        kpis: kpisQ.data,
        generatedAt: new Date(),
        generatorName: profile?.full_name ?? profile?.email ?? 'Unknown',
        dailyVisits: trendQ.data ?? [],
      });
      toast.success('تم تصدير العرض التقديمي');
    } catch (err) {
      toast.error('فشل التصدير', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التنفيذيين"
        description={`تحديث تلقائي كل 5 دقائق · آخر تحديث: ${lastUpdate}`}
        actions={
          <Button onClick={handleExport} disabled={exporting || kpisQ.isLoading}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            تصدير PowerPoint
          </Button>
        }
      />

      {anomalies.length > 0 && !anomaliesLoading && (
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            تنبيهات
          </h2>
          <div className="space-y-2">
            {anomalies.map((a) => (
              <Card
                key={a.id}
                className={cn(
                  'p-4 border-s-4',
                  a.severity === 'high'
                    ? 'border-s-destructive bg-destructive/5'
                    : a.severity === 'medium'
                      ? 'border-s-warning bg-warning/5'
                      : 'border-s-info bg-info/5',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{a.metric}</p>
                    <p className="text-sm text-muted-foreground">{a.message}</p>
                  </div>
                  <Badge
                    variant={
                      a.severity === 'high'
                        ? 'destructive'
                        : a.severity === 'medium'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {a.delta_percent > 0 ? '+' : ''}
                    {a.delta_percent}%
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        {kpisQ.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonKPI key={i} />
            ))}
          </div>
        ) : kpisQ.isError ? (
          <ErrorState
            message={(kpisQ.error as Error)?.message}
            onRetry={() => kpisQ.refetch()}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {KPI_SPECS.map((spec) => {
              const curr = Number(kpisQ.data![spec.key]);
              const prev = spec.comparePrevKey
                ? Number(kpisQ.data![spec.comparePrevKey])
                : null;
              const delta = prev != null && prev !== 0 ? ((curr - prev) / prev) * 100 : null;
              return (
                <button
                  key={String(spec.key)}
                  type="button"
                  onClick={() => setDrilldown(spec)}
                  className="text-start"
                >
                  <HeroKPI
                    label={spec.label}
                    value={spec.format(curr)}
                    icon={spec.icon}
                    tone={spec.tone}
                    delta={delta}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <ChartCard
        title="حجم الزيارات اليومي"
        description="آخر 30 يوم"
        height={300}
      >
        {trendQ.isLoading ? (
          <div className="flex h-full items-center justify-center text-caption">
            جاري التحميل...
          </div>
        ) : (
          <LineStatChart
            data={trendQ.data ?? []}
            xKey="day"
            series={[{ key: 'visits', label: 'الزيارات' }]}
          />
        )}
      </ChartCard>

      <Dialog open={drilldown !== null} onOpenChange={(o) => !o && setDrilldown(null)}>
        <DialogContent className="max-w-xl">
          {drilldown && kpisQ.data && (
            <>
              <DialogHeader>
                <DialogTitle>{drilldown.label}</DialogTitle>
                <DialogDescription>تفاصيل المقياس وتغيّره</DialogDescription>
              </DialogHeader>
              <DrilldownBody spec={drilldown} kpis={kpisQ.data} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface HeroKPIProps {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  tone: 'default' | 'success' | 'warning' | 'danger' | 'info';
  delta: number | null;
}

const TONE_BG: Record<HeroKPIProps['tone'], string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

function HeroKPI({ label, value, icon: Icon, tone, delta }: HeroKPIProps) {
  const deltaUp = delta != null && delta >= 0;
  return (
    <Card className="p-5 transition-all hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-caption uppercase tracking-wide">{label}</p>
          <p className="text-display tabular-nums text-foreground">{value}</p>
          {delta != null && (
            <p
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                deltaUp ? 'text-success' : 'text-destructive',
              )}
            >
              {deltaUp ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
              {Math.abs(delta).toFixed(1)}% مقابل الفترة السابقة
            </p>
          )}
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', TONE_BG[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function DrilldownBody({ spec, kpis }: { spec: KpiSpec; kpis: ExecutiveKPIs }) {
  const curr = Number(kpis[spec.key]);
  const prev = spec.comparePrevKey ? Number(kpis[spec.comparePrevKey]) : null;
  const delta = prev != null && prev !== 0 ? ((curr - prev) / prev) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-caption uppercase tracking-wide">القيمة الحالية</p>
        <p className="mt-1 text-display tabular-nums">{spec.format(curr)}</p>
      </div>
      {prev != null && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-caption">الفترة السابقة</p>
            <p className="mt-1 text-h2 tabular-nums">{spec.format(prev)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-caption">التغيّر</p>
            <p
              className={cn(
                'mt-1 text-h2 tabular-nums',
                delta != null && delta >= 0 ? 'text-success' : 'text-destructive',
              )}
            >
              {delta != null
                ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </div>
      )}
      <p className="text-caption">
        المصدر: تجميع مباشر من جداول customers و visits و raw_data_invoices و
        near_expiry_records.
      </p>
    </div>
  );
}
