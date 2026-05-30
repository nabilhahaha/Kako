import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { OrderEditor, type EditorOrder, type OrderItem, type MenuCategory } from './order-editor';

export default async function OrderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  const { id } = await params;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from('erp_restaurant_orders')
    .select('id, order_type, status, customer_name, customer_phone, customer_address, delivery_fee, discount_type, discount_value, service_rate, tax_rate, notes, table:erp_restaurant_tables(name)')
    .eq('id', id)
    .maybeSingle();
  if (!order) notFound();
  const o = order as unknown as {
    id: string; order_type: string; status: string; customer_name: string | null; customer_phone: string | null;
    customer_address: string | null; delivery_fee: number; discount_type: string; discount_value: number;
    service_rate: number; tax_rate: number; notes: string | null; table: { name: string } | null;
  };

  const [{ data: items }, { data: products }, { data: cats }] = await Promise.all([
    supabase.from('erp_restaurant_order_items').select('id, product_id, name, qty, price, notes, kitchen_status').eq('order_id', id).order('created_at'),
    supabase.from('erp_products_catalog').select('id, name, name_ar, sell_price, category_id').eq('is_active', true).order('name'),
    supabase.from('erp_product_categories').select('id, name, name_ar'),
  ]);

  const catName = new Map(((cats as { id: string; name: string; name_ar: string | null }[]) ?? []).map((c) => [c.id, c.name_ar || c.name]));
  const byCat = new Map<string, MenuCategory>();
  for (const p of (products as { id: string; name: string; name_ar: string | null; sell_price: number; category_id: string | null }[]) ?? []) {
    const key = p.category_id ?? '—';
    const label = p.category_id ? (catName.get(p.category_id) ?? t('restaurant.menuItemsLabel')) : t('restaurant.menuItemsLabel');
    if (!byCat.has(key)) byCat.set(key, { id: key, name: label, items: [] });
    byCat.get(key)!.items.push({ id: p.id, name: p.name_ar || p.name, price: Number(p.sell_price || 0) });
  }

  const editorOrder: EditorOrder = {
    id: o.id, order_type: o.order_type, status: o.status,
    customer_name: o.customer_name, customer_phone: o.customer_phone, customer_address: o.customer_address,
    delivery_fee: Number(o.delivery_fee || 0),
    discount_type: o.discount_type === 'percent' ? 'percent' : 'amount',
    discount_value: Number(o.discount_value || 0),
    service_rate: Number(o.service_rate || 0),
    tax_rate: Number(o.tax_rate || 0),
    notes: o.notes, table_name: o.table?.name ?? null,
  };

  return (
    <OrderEditor
      order={editorOrder}
      items={(items as OrderItem[]) ?? []}
      menu={[...byCat.values()]}
    />
  );
}
