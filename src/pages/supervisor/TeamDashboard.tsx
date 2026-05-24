import {
  Users,
  ClipboardList,
  CheckSquare,
  Package2,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';

export function TeamDashboard() {
  const profile = useAuthStore((s) => s.profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلاً ${profile?.full_name?.split(' ')[0] ?? ''}`.trim() || 'لوحة المشرف'}
        description="إدارة الزيارات والعملاء"
      />

      <section className="space-y-3">
        <Link to="/supervisor/visits/new" className="block">
          <Card className="flex items-center gap-4 border-primary/20 bg-primary/5 p-5 transition-all hover:shadow-md">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Plus className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-foreground">تسجيل زيارة جديدة</p>
              <p className="text-sm text-muted-foreground">6 خطوات: عميل → موقع → صور → منافسين → مشكلات → ملخص</p>
            </div>
            <ArrowLeft className="h-5 w-5 shrink-0 text-primary" />
          </Card>
        </Link>
      </section>

      <section className="grid gap-3 grid-cols-2">
        <QuickLink to="/supervisor/customers" icon={Users} label="العملاء" desc="15 عميل" />
        <QuickLink to="/supervisor/visits" icon={ClipboardList} label="سجل الزيارات" desc="آخر 100 زيارة" />
        <QuickLink to="/supervisor/approvals/visits" icon={CheckSquare} label="موافقات الزيارات" desc="الزيارات المعلّقة" />
        <QuickLink to="/supervisor/approvals/near-expiry" icon={Package2} label="قارب على الانتهاء" desc="طلبات المندوبين" />
      </section>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  desc,
}: {
  to: string;
  icon: typeof Users;
  label: string;
  desc: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="flex flex-col items-center gap-2 p-4 text-center transition-all hover:border-primary/40 hover:shadow-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </Card>
    </Link>
  );
}
