import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { UtensilsCrossed, LayoutGrid, ChefHat, Wallet, Receipt, type LucideIcon } from 'lucide-react';

function Stat({ label, value, icon: Icon, tone = 'primary', href }: {
  label: string; value: string; icon: LucideIcon; tone?: 'primary' | 'success' | 'warning' | 'info'; href?: string;
}) {
  const toneCls = { primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', info: 'bg-info/10 text-info' }[tone];
  const body = (
    <Card className={href ? 'transition-colors hover:border-primary/40' : ''}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneCls}`}><Icon className="h-6 w-6" /></div>
        <div className="min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="truncate text-xl font-bold tabular-nums" dir="ltr">{value}</p></div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function RestaurantDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="لوحة المطعم" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة المطعم تتم من داخل حساب المطعم.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: closed }, { data: openOrders }, { data: tables }, { data: kitchenItems }] = await Promise.all([
    supabase.from('erp_restaurant_orders').select('total').eq('status', 'closed').gte('closed_at', `${today}T00:00:00`),
    supabase.from('erp_restaurant_orders').select('id').eq('status', 'open'),
    supabase.from('erp_restaurant_tables').select('status').eq('is_active', true),
    supabase.from('erp_restaurant_order_items').select('id').in('kitchen_status', ['new', 'preparing']),
  ]);

  const sales = ((closed as { total: number }[]) ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
  const openCount = ((openOrders as unknown[]) ?? []).length;
  const occupied = ((tables as { status: string }[]) ?? []).filter((t) => t.status === 'occupied').length;
  const tablesTotal = ((tables as unknown[]) ?? []).length;
  const kitchenCount = ((kitchenItems as unknown[]) ?? []).length;

  return (
    <div>
      <PageHeader title="لوحة المطعم / الكافيه" description="نظرة سريعة على نشاط اليوم." action={
        <Link href="/restaurant/orders" className={buttonVariants({ size: 'sm' })}><UtensilsCrossed className="h-4 w-4" /> الأوردرات</Link>
      } />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="مبيعات اليوم" value={formatCurrency(sales)} icon={Wallet} tone="success" />
        <Stat label="أوردرات مفتوحة" value={String(openCount)} icon={Receipt} tone="info" href="/restaurant/orders" />
        <Stat label="طاولات مشغولة" value={`${occupied} / ${tablesTotal}`} icon={LayoutGrid} tone="warning" href="/restaurant/tables" />
        <Stat label="أصناف في المطبخ" value={String(kitchenCount)} icon={ChefHat} tone="primary" href="/restaurant/kitchen" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/restaurant/tables" className={buttonVariants({ variant: 'outline' })}><LayoutGrid className="h-4 w-4" /> الطاولات</Link>
        <Link href="/restaurant/kitchen" className={buttonVariants({ variant: 'outline' })}><ChefHat className="h-4 w-4" /> شاشة المطبخ</Link>
      </div>
    </div>
  );
}
