import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { WashingMachine, Wallet, Clock, PackageCheck } from 'lucide-react';

export default async function LaundryDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="لوحة المغسلة" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة المغسلة تتم من داخل حساب المغسلة.</p></div>);
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: active }, { data: closed }] = await Promise.all([
    supabase.from('erp_laundry_orders').select('status').in('status', ['received', 'washing', 'ready']),
    supabase.from('erp_laundry_orders').select('total').eq('status', 'delivered').gte('delivered_at', `${today}T00:00:00`),
  ]);
  const a = (active as { status: string }[]) ?? [];
  const count = (st: string) => a.filter((x) => x.status === st).length;
  const sales = ((closed as { total: number }[]) ?? []).reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <div>
      <PageHeader title="لوحة المغسلة" description="نظرة سريعة على الطلبات والتحصيل." action={
        <Link href="/laundry/orders" className={buttonVariants({ size: 'sm' })}><WashingMachine className="h-4 w-4" /> الطلبات</Link>
      } />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="مبيعات اليوم" value={formatCurrency(sales)} icon={Wallet} tone="success" />
        <Stat label="قيد الاستلام" value={String(count('received'))} icon={Clock} tone="info" href="/laundry/orders" />
        <Stat label="تحت الغسيل" value={String(count('washing'))} icon={WashingMachine} tone="warning" href="/laundry/orders" />
        <Stat label="جاهز للتسليم" value={String(count('ready'))} icon={PackageCheck} tone="primary" href="/laundry/orders" />
      </div>
    </div>
  );
}
