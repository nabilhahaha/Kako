import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function SalonDayClosing({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;
  const date = sp.date || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [{ data: ticketsData }, { data: staffData }] = await Promise.all([
    supabase.from('erp_salon_tickets').select('id, total, payment_method, stylist_id').eq('status', 'closed').gte('closed_at', `${date}T00:00:00`).lte('closed_at', `${date}T23:59:59`),
    supabase.rpc('erp_salon_staff'),
  ]);
  const tickets = (ticketsData as { id: string; total: number; payment_method: string | null; stylist_id: string | null }[]) ?? [];
  const staff = (staffData as { id: string; full_name: string | null; email: string | null }[]) ?? [];
  const stylistName = (id: string | null) => { const s = staff.find((x) => x.id === id); return s ? (s.full_name || s.email || 'مصفف') : 'غير محدد'; };

  const total = tickets.reduce((s, t) => s + Number(t.total || 0), 0);
  const cash = tickets.filter((t) => t.payment_method !== 'card').reduce((s, t) => s + Number(t.total || 0), 0);
  const card = tickets.filter((t) => t.payment_method === 'card').reduce((s, t) => s + Number(t.total || 0), 0);
  const byStylist = new Map<string, { count: number; total: number }>();
  for (const t of tickets) { const k = t.stylist_id || '—'; const c = byStylist.get(k) ?? { count: 0, total: 0 }; c.count += 1; c.total += Number(t.total || 0); byStylist.set(k, c); }
  const name = ctx.company?.name_ar || ctx.company?.name || 'الصالون';

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label="طباعة تقفيل اليوم" /></div>
      <div className="border-b pb-3 text-center"><h1 className="text-lg font-bold">{name} — تقفيل اليوم</h1><p className="text-sm">التاريخ: <b dir="ltr">{formatDate(date)}</b></p></div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Box label="عدد التذاكر" value={String(tickets.length)} /><Box label="الإجمالي" value={formatCurrency(total)} /><Box label="كاش" value={formatCurrency(cash)} /><Box label="فيزا" value={formatCurrency(card)} />
      </div>
      <div>
        <h3 className="mb-1 font-semibold">حسب المصفف</h3>
        <table className="w-full border-collapse">
          <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">المصفف</th><th className="p-2 text-center">تذاكر</th><th className="p-2 text-left">الإجمالي</th></tr></thead>
          <tbody>
            {[...byStylist.entries()].map(([id, v]) => (<tr key={id} className="border-b"><td className="p-2">{id === '—' ? 'غير محدد' : stylistName(id)}</td><td className="p-2 text-center tabular-nums">{v.count}</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(v.total)}</td></tr>))}
            {byStylist.size === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا مبيعات</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-2"><p className="text-xs text-gray-500">{label}</p><p className="font-bold tabular-nums" dir="ltr">{value}</p></div>;
}
