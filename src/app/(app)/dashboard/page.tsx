import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import {
  Building2,
  Users,
  Package,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';

async function safeCount(
  table: string,
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const ctx = await getUserContext();
  const name = ctx?.profile.full_name || ctx?.profile.email || '';

  const [branches, users, products, customers] = await Promise.all([
    safeCount('erp_branches'),
    safeCount('erp_profiles'),
    safeCount('erp_products_catalog'),
    safeCount('erp_customers'),
  ]);

  return (
    <div>
      <PageHeader
        title={`أهلاً ${name} 👋`}
        description="نظرة عامة على نشاط الشركة"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="الفروع" value={branches} icon={Building2} />
        <StatCard label="المستخدمون" value={users} icon={Users} />
        <StatCard label="المنتجات" value={products} icon={Package} />
        <StatCard label="العملاء" value={customers} icon={ShoppingCart} />
      </div>

      <Card className="mt-6">
        <CardContent className="p-6">
          <h2 className="mb-2 text-lg font-semibold">الخطوات التالية</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>أنشئ الشركة والفروع من إعدادات الفروع</li>
            <li>أضف المستخدمين واربطهم بالفروع وحدّد أدوارهم</li>
            <li>سجّل المنتجات والمخازن لبدء إدارة المخزون</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
