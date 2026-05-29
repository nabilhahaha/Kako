import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS: Record<string, string> = { received: 'استلام', washing: 'غسيل', ready: 'جاهز', delivered: 'تم التسليم', cancelled: 'ملغي' };

export default async function LaundryOrderPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: order } = await supabase
    .from('erp_laundry_orders')
    .select('id, status, customer_name, customer_phone, is_delivery, delivery_fee, discount_value, due_date, payment_method, created_at, items:erp_laundry_order_items(name, qty, price)')
    .eq('id', id).maybeSingle();
  if (!order) notFound();
  const o = order as unknown as {
    status: string; customer_name: string | null; customer_phone: string | null; is_delivery: boolean;
    delivery_fee: number; discount_value: number; due_date: string | null; payment_method: string | null; created_at: string;
    items: { name: string; qty: number; price: number }[] | null;
  };
  const items = o.items ?? [];
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = Math.min(Number(o.discount_value || 0), subtotal);
  const total = Math.max(subtotal - discount + Number(o.delivery_fee || 0), 0);
  const name = ctx.company?.name_ar || ctx.company?.name || 'المغسلة';

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة الإيصال" /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{name}</h1>
        {ctx.company?.phone && <p className="text-xs text-gray-600" dir="ltr">{ctx.company.phone}</p>}
        <p className="mt-1 text-xs">إيصال استلام مغسلة · <span dir="ltr">{formatDate(o.created_at)}</span> · {STATUS[o.status] ?? o.status}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {o.customer_name && <div><span className="text-gray-500">العميل: </span><b>{o.customer_name}</b></div>}
        {o.customer_phone && <div className="text-left" dir="ltr">{o.customer_phone}</div>}
        {o.due_date && <div><span className="text-gray-500">موعد التسليم: </span><span dir="ltr">{formatDate(o.due_date)}</span></div>}
        {o.is_delivery && <div className="text-left">توصيل للمنزل</div>}
      </div>

      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الصنف</th><th className="p-2 text-center">العدد</th><th className="p-2 text-left">السعر</th><th className="p-2 text-left">الإجمالي</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b"><td className="p-2">{it.name}</td><td className="p-2 text-center tabular-nums">{it.qty}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.price)}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.qty * it.price)}</td></tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="p-2 text-center text-gray-500">لا أصناف</td></tr>}
        </tbody>
      </table>

      <div className="ms-auto w-56 space-y-1">
        <div className="flex justify-between"><span className="text-gray-500">الإجمالي الفرعي</span><span className="tabular-nums" dir="ltr">{formatCurrency(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between"><span className="text-gray-500">الخصم</span><span className="tabular-nums" dir="ltr">- {formatCurrency(discount)}</span></div>}
        {o.delivery_fee > 0 && <div className="flex justify-between"><span className="text-gray-500">رسوم التوصيل</span><span className="tabular-nums" dir="ltr">{formatCurrency(o.delivery_fee)}</span></div>}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>
        {o.payment_method && <div className="flex justify-between text-xs text-gray-500"><span>طريقة الدفع</span><span>{o.payment_method === 'card' ? 'فيزا' : 'كاش'}</span></div>}
      </div>
      <p className="pt-4 text-center text-xs text-gray-500">برجاء الاحتفاظ بالإيصال لاستلام الطلب 🙏</p>
    </div>
  );
}
