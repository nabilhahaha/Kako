import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

const TYPE: Record<string, string> = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'دليفري' };

export default async function RestaurantOrderPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from('erp_restaurant_orders')
    .select('id, order_type, status, customer_name, customer_phone, customer_address, delivery_fee, created_at, table:erp_restaurant_tables(name), items:erp_restaurant_order_items(name, qty, price)')
    .eq('id', id)
    .maybeSingle();
  if (!order) notFound();
  const o = order as unknown as {
    order_type: string; customer_name: string | null; customer_phone: string | null; customer_address: string | null;
    delivery_fee: number; created_at: string; table: { name: string } | null; items: { name: string; qty: number; price: number }[] | null;
  };

  const items = o.items ?? [];
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const total = subtotal + Number(o.delivery_fee || 0);
  const name = ctx.company?.name_ar || ctx.company?.name || 'المطعم';

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة الفاتورة" /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{name}</h1>
        {ctx.company?.phone && <p className="text-xs text-gray-600" dir="ltr">{ctx.company.phone}</p>}
        <p className="mt-1 text-xs">{TYPE[o.order_type] ?? o.order_type}{o.table?.name ? ` — طاولة ${o.table.name}` : ''} · <span dir="ltr">{formatDate(o.created_at)}</span></p>
      </div>

      {(o.customer_name || o.customer_phone || o.customer_address) && (
        <div className="text-xs text-gray-700">
          {o.customer_name && <div>العميل: {o.customer_name}</div>}
          {o.customer_phone && <div dir="ltr">{o.customer_phone}</div>}
          {o.customer_address && <div>{o.customer_address}</div>}
        </div>
      )}

      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-left">السعر</th><th className="p-2 text-left">الإجمالي</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b">
              <td className="p-2">{it.name}</td>
              <td className="p-2 text-center tabular-nums">{it.qty}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.price)}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.qty * it.price)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="p-2 text-center text-gray-500">لا أصناف</td></tr>}
        </tbody>
      </table>

      <div className="ms-auto w-56 space-y-1">
        <div className="flex justify-between"><span className="text-gray-500">الإجمالي الفرعي</span><span className="tabular-nums" dir="ltr">{formatCurrency(subtotal)}</span></div>
        {o.delivery_fee > 0 && <div className="flex justify-between"><span className="text-gray-500">رسوم التوصيل</span><span className="tabular-nums" dir="ltr">{formatCurrency(o.delivery_fee)}</span></div>}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>
      </div>

      <p className="pt-4 text-center text-xs text-gray-500">شكراً لزيارتكم 🙏</p>
    </div>
  );
}
