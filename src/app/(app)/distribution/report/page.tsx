import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { MonthNav } from '../month-nav';

const ACTIVE = ['issued', 'paid', 'partially_paid', 'overdue'];
function currentMonth() { return new Date().toISOString().slice(0, 7); }

interface Rep { id: string; full_name: string | null; email: string | null }

export default async function DistributionReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission('reports.view');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="تقرير التوزيع" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month! : currentMonth();
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  const startStr = start.toISOString(); const endStr = end.toISOString();
  const startDate = `${month}-01`; const endDate = end.toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: reps }, { data: invoices }, { data: payments }, { data: targets }] = await Promise.all([
    supabase.rpc('erp_company_reps'),
    supabase.from('erp_invoices').select('net_amount, status, created_by, created_at').gte('created_at', startStr).lt('created_at', endStr),
    supabase.from('erp_payments').select('amount, received_by, payment_date').gte('payment_date', startDate).lt('payment_date', endDate),
    supabase.from('erp_rep_targets').select('user_id, target_amount, commission_pct').eq('month', startDate),
  ]);

  const salesBy = new Map<string, number>();
  for (const i of (invoices as { net_amount: number; status: string; created_by: string | null }[]) ?? []) {
    if (!i.created_by || !ACTIVE.includes(i.status)) continue;
    salesBy.set(i.created_by, (salesBy.get(i.created_by) ?? 0) + Number(i.net_amount || 0));
  }
  const collBy = new Map<string, number>();
  for (const p of (payments as { amount: number; received_by: string | null }[]) ?? []) {
    if (!p.received_by) continue;
    collBy.set(p.received_by, (collBy.get(p.received_by) ?? 0) + Number(p.amount || 0));
  }
  const tgt = new Map(((targets as { user_id: string; target_amount: number; commission_pct: number }[]) ?? []).map((t) => [t.user_id, t]));

  const rows = ((reps as Rep[]) ?? []).map((r) => {
    const sales = salesBy.get(r.id) ?? 0;
    const collections = collBy.get(r.id) ?? 0;
    const t = tgt.get(r.id);
    const target = Number(t?.target_amount ?? 0);
    const pct = Number(t?.commission_pct ?? 0);
    return {
      id: r.id, name: r.full_name || r.email || 'مندوب', sales, collections, target, pct,
      achievement: target > 0 ? Math.round((sales / target) * 100) : null,
      commission: sales * pct / 100,
    };
  });
  const tot = rows.reduce((a, r) => ({ sales: a.sales + r.sales, collections: a.collections + r.collections, target: a.target + r.target, commission: a.commission + r.commission }), { sales: 0, collections: 0, target: 0, commission: 0 });

  return (
    <div>
      <PageHeader title="تقرير التوزيع" description="مبيعات وتحصيل كل مندوب مقابل الهدف والعمولة." action={<MonthNav month={month} base="/distribution/report" />} />
      <Card><CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">لا يوجد مناديب.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-right font-medium">المندوب</th>
              <th className="p-3 text-center font-medium">المبيعات</th>
              <th className="p-3 text-center font-medium">الهدف</th>
              <th className="p-3 text-center font-medium">التحقيق</th>
              <th className="p-3 text-center font-medium">المحصّل</th>
              <th className="p-3 text-center font-medium">العمولة</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.sales)}</td>
                  <td className="p-3 text-center tabular-nums text-muted-foreground" dir="ltr">{r.target > 0 ? formatCurrency(r.target) : '—'}</td>
                  <td className="p-3 text-center">{r.achievement != null ? <Badge variant={r.achievement >= 100 ? 'success' : r.achievement >= 70 ? 'warning' : 'secondary'}>{r.achievement}%</Badge> : '—'}</td>
                  <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.collections)}</td>
                  <td className="p-3 text-center tabular-nums text-success" dir="ltr">{r.pct > 0 ? formatCurrency(r.commission) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-bold"><tr>
              <td className="p-3">الإجمالي</td>
              <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(tot.sales)}</td>
              <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(tot.target)}</td>
              <td className="p-3 text-center">{tot.target > 0 ? `${Math.round((tot.sales / tot.target) * 100)}%` : '—'}</td>
              <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(tot.collections)}</td>
              <td className="p-3 text-center tabular-nums text-success" dir="ltr">{formatCurrency(tot.commission)}</td>
            </tr></tfoot>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
