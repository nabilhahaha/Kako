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
    .select('id, order_type, status, customer_name, customer_phone, customer_address, delivery_fee, discount_type, discount_value, service_rate, tax_rate, payment_method, created_at, table:erp_restaurant_tables(name), items:erp_restaurant_order_items(name, qty, price)')
    .eq('id', id)
    .maybeSingle();
  if (!order) notFound();
  const o = order as unknown as {
    order_type: string; customer_name: string | null; customer_phone: string | null; customer_address: string | null;
    delivery_fee: number; discount_type: string; discount_value: number; service_rate: number; tax_rate: number;
    payment_method: string | null; created_at: string; table: { name: string } | null; items: { name: string; qty: number; price: number }[] | null;
  };

  const items = o.items ?? [];
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = o.discount_type === 'percent' ? Math.round(subtotal * Number(o.discount_value)) / 100 : Math.min(Number(o.discount_value || 0), subtotal);
  const base = Math.max(subtotal - discount + Number(o.delivery_fee || 0), 0);
  const service = Math.round(base * Number(o.service_rate || 0)) / 100;
  const tax = Math.round((base + service) * Number(o.tax_rate || 0)) / 100;
  const total = base + service + tax;
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
        {discount > 0 && <div className="flex justify-between"><span className="text-gray-500">الخصم</span><span className="tabular-nums" dir="ltr">- {formatCurrency(discount)}</span></div>}
        {o.delivery_fee > 0 && <div className="flex justify-between"><span className="text-gray-500">رسوم التوصيل</span><span className="tabular-nums" dir="ltr">{formatCurrency(o.delivery_fee)}</span></div>}
        {service > 0 && <div className="flex justify-between"><span className="text-gray-500">خدمة {o.service_rate}%</span><span className="tabular-nums" dir="ltr">{formatCurrency(service)}</span></div>}
        {tax > 0 && <div className="flex justify-between"><span className="text-gray-500">ضريبة {o.tax_rate}%</span><span className="tabular-nums" dir="ltr">{formatCurrency(tax)}</span></div>}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>
        {o.payment_method && <div className="flex justify-between text-xs text-gray-500"><span>طريقة الدفع</span><span>{o.payment_method === 'card' ? 'فيزا' : 'كاش'}</span></div>}
      </div>

      <p className="pt-4 text-center text-xs text-gray-500">شكراً لزيارتكم 🙏</p>
    </div>
  );
}
