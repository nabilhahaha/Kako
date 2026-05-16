import { Link } from 'react-router-dom';
import { Users, ClipboardList, Database, FileSpreadsheet, ShieldCheck, Activity } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { SkeletonKPI } from '@/components/shared/SkeletonCard';
import { Card } from '@/components/ui/card';
import { useAdminStats } from '@/hooks/useAdminStats';
import { formatNumber } from '@/lib/utils';

export function AdminDashboard() {
  const { data, isLoading } = useAdminStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة النظام"
        description="نظرة عامة على صحة النظام والمستخدمين"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)
        ) : (
          <>
            <KPICard
              icon={Users}
              label="المستخدمون"
              value={formatNumber(data.totalUsers)}
              hint={`نشط: ${formatNumber(data.activeUsers)}`}
              tone="info"
            />
            <KPICard
              icon={Database}
              label="العملاء"
              value={formatNumber(data.totalCustomers)}
              hint="إجمالي في النظام"
              tone="success"
            />
            <KPICard
              icon={Activity}
              label="زيارات 24 ساعة"
              value={formatNumber(data.visits24h)}
              hint="آخر يوم"
              tone="info"
            />
            <KPICard
              icon={ShieldCheck}
              label="موافقات معلّقة"
              value={formatNumber(data.pendingApprovals)}
              hint="زيارات + قارب على الانتهاء"
              tone="warning"
            />
          </>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/admin/users" icon={Users} title="المستخدمون" desc="إدارة وأدوار" />
        <QuickLink
          to="/admin/raw-data"
          icon={FileSpreadsheet}
          title="البيانات الخام"
          desc="رفع Excel من SalesBuzz"
        />
        <QuickLink
          to="/admin/settings"
          icon={ClipboardList}
          title="الإعدادات"
          desc="أسباب الزيارة، المنتجات"
        />
        <QuickLink
          to="/admin/audit"
          icon={Activity}
          title="سجل النشاط"
          desc="تتبّع الإجراءات"
        />
      </section>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: typeof Users;
  title: string;
  desc: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="p-5 transition-all hover:border-primary/40 hover:shadow-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <p className="mt-3 font-medium text-foreground">{title}</p>
        <p className="text-caption">{desc}</p>
      </Card>
    </Link>
  );
}
