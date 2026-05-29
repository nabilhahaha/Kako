import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { OrdersList, type LaundryOrder } from './orders-list';

export default async function LaundryOrdersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="الطلبات" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة المغسلة تتم من داخل حساب المغسلة.</p></div>);
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_laundry_orders')
    .select('id, customer_name, customer_phone, status, due_date, is_delivery, delivery_fee, discount_value, created_at, items:erp_laundry_order_items(qty, price)')
    .in('status', ['received', 'washing', 'ready'])
    .order('created_at', { ascending: true });

  const orders: LaundryOrder[] = ((data as unknown as Array<{
    id: string; customer_name: string | null; customer_phone: string | null; status: string; due_date: string | null;
    is_delivery: boolean; delivery_fee: number; discount_value: number; items: { qty: number; price: number }[] | null;
  }>) ?? []).map((o) => ({
    id: o.id, customer_name: o.customer_name, customer_phone: o.customer_phone, status: o.status, due_date: o.due_date, is_delivery: o.is_delivery,
    total: Math.max((o.items ?? []).reduce((s, it) => s + Number(it.qty) * Number(it.price), 0) - Number(o.discount_value || 0) + Number(o.delivery_fee || 0), 0),
    item_count: (o.items ?? []).reduce((s, it) => s + Number(it.qty), 0),
  }));

  return (
    <div>
      <PageHeader title="طلبات المغسلة" description="استلام، غسيل، جاهز، ثم تسليم وتحصيل." />
      <OrdersList orders={orders} />
    </div>
  );
}
