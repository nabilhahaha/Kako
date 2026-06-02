import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { OrderEditor, type EditorOrder, type OrderItem, type MenuService } from './order-editor';

export default async function LaundryOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: order } = await supabase
    .from('erp_laundry_orders')
    .select('id, status, customer_name, customer_phone, customer_address, is_delivery, delivery_fee, discount_value, due_date, notes')
    .eq('id', id).maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: services }] = await Promise.all([
    supabase.from('erp_laundry_order_items').select('id, name, qty, price').eq('order_id', id).order('created_at'),
    supabase.from('erp_laundry_services').select('id, name, price').eq('is_active', true).order('name'),
  ]);

  const o = order as unknown as EditorOrder;
  return (
    <OrderEditor
      order={{ ...o, delivery_fee: Number(o.delivery_fee || 0), discount_value: Number(o.discount_value || 0) }}
      items={(items as OrderItem[]) ?? []}
      services={(services as MenuService[]) ?? []}
    />
  );
}
