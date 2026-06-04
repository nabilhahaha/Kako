import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

const TYPE: Record<string, string> = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'دليفري' };

export default async function RestaurantDayClosing({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;
  const date = sp.date || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: ordersData } = await supabase
    .from('erp_restaurant_orders')
    .select('id, order_type, total, payment_method')
    .eq('status', 'closed')
    .gte('closed_at', `${date}T00:00:00`)
    .lte('closed_at', `${date}T23:59:59`);
  const orders = (ordersData as { id: string; order_type: string; total: number; payment_method: string | null }[]) ?? [];

  let topItems: { name: string; qty: number; revenue: number }[] = [];
  if (orders.length > 0) {
    const { data: itemsData } = await supabase
      .from('erp_restaurant_order_items')
      .select('name, qty, price, order_id')
      .in('order_id', orders.map((o) => o.id));
    const m = new Map<string, { qty: number; revenue: number }>();
    for (const it of (itemsData as { name: string; qty: number; price: number }[]) ?? []) {
      const cur = m.get(it.name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.qty); cur.revenue += Number(it.qty) * Number(it.price);
      m.set(it.name, cur);
    }
    topItems = [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 15);
  }

  const total = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const cash = orders.filter((o) => o.payment_method !== 'card').reduce((s, o) => s + Number(o.total || 0), 0);
  const card = orders.filter((o) => o.payment_method === 'card').reduce((s, o) => s + Number(o.total || 0), 0);
  const byType = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    const cur = byType.get(o.order_type) ?? { count: 0, total: 0 };
    cur.count += 1; cur.total += Number(o.total || 0);
    byType.set(o.order_type, cur);
  }
  const name = ctx.company?.name_ar || ctx.company?.name || 'المطعم';

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة تقفيل اليوم" /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{name} — تقفيل اليوم</h1>
        <p className="text-sm">التاريخ: <b dir="ltr">{formatDate(date)}</b></p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Box label="عدد الأوردرات" value={String(orders.length)} />
        <Box label="إجمالي المبيعات" value={formatCurrency(total)} />
        <Box label="كاش" value={formatCurrency(cash)} />
        <Box label="فيزا" value={formatCurrency(card)} />
      </div>

      <div>
        <h3 className="mb-1 font-semibold">حسب النوع</h3>
        <table className="w-full border-collapse">
          <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">النوع</th><th className="p-2 text-center">عدد</th><th className="p-2 text-left">الإجمالي</th></tr></thead>
          <tbody>
            {[...byType.entries()].map(([t, v]) => (
              <tr key={t} className="border-b"><td className="p-2">{TYPE[t] ?? t}</td><td className="p-2 text-center tabular-nums">{v.count}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(v.total)}</td></tr>
            ))}
            {byType.size === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا مبيعات</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">أكثر الأصناف مبيعاً</h3>
        <table className="w-full border-collapse">
          <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-left">الإيراد</th></tr></thead>
          <tbody>
            {topItems.map((it) => (
              <tr key={it.name} className="border-b"><td className="p-2">{it.name}</td><td className="p-2 text-center tabular-nums">{it.qty}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(it.revenue)}</td></tr>
            ))}
            {topItems.length === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا أصناف</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-2"><p className="text-xs text-gray-500">{label}</p><p className="font-bold tabular-nums" dir="ltr">{value}</p></div>;
}
