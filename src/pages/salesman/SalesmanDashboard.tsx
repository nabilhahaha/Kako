import { Link } from 'react-router-dom';
import {
  Target,
  ShoppingBag,
  MapPinCheck,
  ArrowLeft,
  Plus,
  ClipboardList,
  PackageX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { SkeletonKPI } from '@/components/shared/SkeletonCard';
import { ErrorState } from '@/components/shared/ErrorState';
import { CustomerCard } from '@/components/customer/CustomerCard';
import { useAuthStore } from '@/stores/authStore';
import { useSalesmanDashboard } from '@/hooks/useDashboard';
import { useCustomers } from '@/hooks/useCustomers';
import { formatNumber } from '@/lib/utils';

const STATUS_TONE: Record<
  string,
  { variant: 'success' | 'warning' | 'destructive' | 'secondary'; label: string }
> = {
  excellent: { variant: 'success', label: 'ممتاز' },
  good: { variant: 'success', label: 'جيد' },
  average: { variant: 'warning', label: 'متوسط' },
  poor: { variant: 'destructive', label: 'ضعيف' },
};

export function SalesmanDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const dashQ = useSalesmanDashboard(userId, 30);
  const custQ = useCustomers(userId);

  const customers = custQ.data ?? [];
  const top = customers.slice(0, 5);

  const statusKey = dashQ.data?.performance_status?.toLowerCase() ?? '';
  const status = STATUS_TONE[statusKey];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`مرحباً ${profile?.full_name?.split(' ')[0] ?? ''}`.trim() || 'مرحباً'}
        description="نظرة عامة على أداء آخر 30 يوم"
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 text-foreground">المؤشرات</h2>
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
        </div>

        {dashQ.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
          </div>
        ) : dashQ.isError ? (
          <ErrorState
            title="تعذّر تحميل المؤشرات"
            message={(dashQ.error as Error)?.message}
            onRetry={() => dashQ.refetch()}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <KPICard
              label="معدل التحول"
              value={`${formatNumber(dashQ.data?.strike_rate ?? 0)}%`}
              hint="Strike rate · زيارات أنتجت طلبات"
              icon={Target}
              tone="info"
            />
            <KPICard
              label="متوسط الطلب"
              value={formatNumber(dashQ.data?.drop_size ?? 0)}
              hint="Drop size · متوسط قيمة الطلب"
              icon={ShoppingBag}
              tone="success"
            />
            <KPICard
              label="التغطية"
              value={`${formatNumber(dashQ.data?.coverage_percent ?? 0)}%`}
              hint="Coverage · عملاء تمت زيارتهم"
              icon={MapPinCheck}
              tone="warning"
            />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 text-foreground">عملاء الأولوية</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/salesman/customers" className="gap-1">
              عرض الكل ({customers.length})
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {custQ.isLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-20 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : custQ.isError ? (
          <ErrorState onRetry={() => custQ.refetch()} />
        ) : top.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            لا يوجد عملاء معيّنون لك حالياً
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {top.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                to={`/salesman/customers/${c.id}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          to="/salesman/visits/new"
          icon={Plus}
          title="زيارة جديدة"
          description="ابدأ زيارة بـ 3 خطوات"
        />
        <QuickAction
          to="/salesman/visits"
          icon={ClipboardList}
          title="سجل الزيارات"
          description="آخر 100 زيارة"
        />
        <QuickAction
          to="/salesman/near-expiry"
          icon={PackageX}
          title="قارب على الانتهاء"
          description="تسجيل منتج مع صورة"
        />
      </section>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Plus;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="flex items-start gap-3 p-4 transition-all hover:border-primary/40 hover:shadow-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-caption">{description}</p>
        </div>
        <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
      </Card>
    </Link>
  );
}
