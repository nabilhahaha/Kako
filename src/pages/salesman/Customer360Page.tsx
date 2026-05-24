import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  ExternalLink,
  Plus,
  Sparkles,
  Wallet,
  Clock,
  ClipboardCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GradeBadge } from '@/components/customer/GradeBadge';
import { HealthScore } from '@/components/customer/HealthScore';
import { useCustomer360 } from '@/hooks/useCustomers';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function Customer360Page() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const { data, isLoading, isError, refetch, error } = useCustomer360(customerId);

  return (
    <div className="space-y-6">
      <PageHeader
        back="/supervisor/customers"
        title={
          isLoading
            ? 'جاري التحميل...'
            : data?.customer_name_ar || data?.customer_name || 'العميل'
        }
        description={
          data
            ? `${data.customer_code}${data.channel_type ? ` · ${data.channel_type}` : ''}`
            : undefined
        }
        actions={
          data && (
            <Button asChild>
              <Link to={`/supervisor/visits/new?customerId=${data.customer_id}`}>
                <Plus className="h-4 w-4" />
                زيارة جديدة
              </Link>
            </Button>
          )
        }
      />

      {isLoading ? (
        <Customer360Skeleton />
      ) : isError ? (
        <ErrorState
          message={(error as Error)?.message}
          onRetry={() => refetch()}
        />
      ) : !data ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          لا توجد بيانات لهذا العميل.
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-h1 text-foreground">
                  {data.customer_name_ar || data.customer_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data.customer_code} · {data.channel_type}
                </p>
              </div>
              <GradeBadge grade={data.customer_grade} size="lg" />
            </div>
            <HealthScore score={data.health_score} className="mt-6" />
          </Card>

          {data.recommended_action && (
            <Card className="border-warning/30 bg-warning/5 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-h3 text-foreground">التوصية الذكية</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {data.recommended_action}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <section className="space-y-3">
            <h3 className="text-h2 text-foreground">البيانات المالية</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoStat
                icon={Wallet}
                label="إجمالي المديونية"
                value={formatCurrency(data.total_debt)}
                tone="default"
              />
              <InfoStat
                icon={AlertCircle}
                label="المتأخرات"
                value={formatCurrency(data.overdue_amount)}
                tone={Number(data.overdue_amount ?? 0) > 0 ? 'danger' : 'success'}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-h2 text-foreground">سجل النشاط</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoStat
                icon={ClipboardCheck}
                label="عدد الزيارات"
                value={formatNumber(data.total_visits)}
              />
              <InfoStat
                icon={Clock}
                label="آخر زيارة (يوم)"
                value={
                  data.days_since_last_visit != null
                    ? `${formatNumber(data.days_since_last_visit)}`
                    : '—'
                }
              />
            </div>
          </section>

          {data.latitude != null && data.longitude != null && (
            <section className="space-y-3">
              <h3 className="text-h2 text-foreground">الموقع</h3>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a
                  href={`https://maps.google.com/?q=${data.latitude},${data.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  افتح في خرائط جوجل
                </a>
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface InfoStatProps {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'success';
}

const TONE_MAP: Record<NonNullable<InfoStatProps['tone']>, string> = {
  default: 'text-foreground',
  danger: 'text-destructive',
  success: 'text-success',
};

function InfoStat({ icon: Icon, label, value, tone = 'default' }: InfoStatProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-caption uppercase tracking-wide">{label}</p>
          <p className={`text-h2 tabular-nums ${TONE_MAP[tone]}`}>{value}</p>
        </div>
      </div>
    </Card>
  );
}

function Customer360Skeleton() {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-32" />
        <Skeleton className="mt-6 h-28 w-full rounded-xl" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
        </Card>
      </div>
    </div>
  );
}
