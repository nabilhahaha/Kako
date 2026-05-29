import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function SalonTicketPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from('erp_salon_tickets')
    .select('stylist_id, customer_name, customer_phone, discount_value, payment_method, created_at, items:erp_salon_ticket_items(name, qty, price)')
    .eq('id', id).maybeSingle();
  if (!ticket) notFound();
  const t = ticket as unknown as {
    stylist_id: string | null; customer_name: string | null; customer_phone: string | null;
    discount_value: number; payment_method: string | null; created_at: string; items: { name: string; qty: number; price: number }[] | null;
  };
  const { data: staff } = await supabase.rpc('erp_salon_staff');
  const stylist = ((staff as { id: string; full_name: string | null; email: string | null }[]) ?? []).find((s) => s.id === t.stylist_id);

  const items = t.items ?? [];
  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = Math.min(Number(t.discount_value || 0), subtotal);
  const total = Math.max(subtotal - discount, 0);
  const name = ctx.company?.name_ar || ctx.company?.name || 'الصالون';

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة الفاتورة" /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{name}</h1>
        {ctx.company?.phone && <p className="text-xs text-gray-600" dir="ltr">{ctx.company.phone}</p>}
        <p className="mt-1 text-xs"><span dir="ltr">{formatDate(t.created_at)}</span>{stylist ? ` · المصفف: ${stylist.full_name || stylist.email}` : ''}</p>
      </div>
      {(t.customer_name || t.customer_phone) && <div className="text-xs text-gray-700">{t.customer_name && <span>العميل: {t.customer_name} </span>}{t.customer_phone && <span dir="ltr">{t.customer_phone}</span>}</div>}

      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الخدمة</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-left">السعر</th><th className="p-2 text-left">الإجمالي</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b"><td className="p-2">{it.name}</td><td className="p-2 text-center tabular-nums">{it.qty}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.price)}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.qty * it.price)}</td></tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="p-2 text-center text-gray-500">لا خدمات</td></tr>}
        </tbody>
      </table>

      <div className="ms-auto w-56 space-y-1">
        <div className="flex justify-between"><span className="text-gray-500">الإجمالي الفرعي</span><span className="tabular-nums" dir="ltr">{formatCurrency(subtotal)}</span></div>
        {discount > 0 && <div className="flex justify-between"><span className="text-gray-500">الخصم</span><span className="tabular-nums" dir="ltr">- {formatCurrency(discount)}</span></div>}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>
        {t.payment_method && <div className="flex justify-between text-xs text-gray-500"><span>طريقة الدفع</span><span>{t.payment_method === 'card' ? 'فيزا' : 'كاش'}</span></div>}
      </div>
      <p className="pt-4 text-center text-xs text-gray-500">شكراً لزيارتكم 🙏</p>
    </div>
  );
}
