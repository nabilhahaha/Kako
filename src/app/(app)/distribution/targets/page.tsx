import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MonthNav } from '../month-nav';
import { TargetsManager, type Rep, type TargetRow } from './targets-manager';

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission('reports.view');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="أهداف المناديب" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month! : currentMonth();

  const supabase = await createClient();
  const [{ data: reps }, { data: targets }] = await Promise.all([
    supabase.rpc('erp_company_reps'),
    supabase.from('erp_rep_targets').select('user_id, target_amount, commission_pct').eq('month', `${month}-01`),
  ]);
  const tmap = new Map(((targets as { user_id: string; target_amount: number; commission_pct: number }[]) ?? []).map((t) => [t.user_id, t]));
  const rows: TargetRow[] = ((reps as Rep[]) ?? []).map((r) => ({
    id: r.id, name: r.full_name || r.email || 'مندوب',
    target_amount: Number(tmap.get(r.id)?.target_amount ?? 0),
    commission_pct: Number(tmap.get(r.id)?.commission_pct ?? 0),
  }));

  return (
    <div>
      <PageHeader title="أهداف وعمولات المناديب" description="حدّد هدف المبيعات الشهري ونسبة العمولة لكل مندوب." action={<MonthNav month={month} base="/distribution/targets" />} />
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا يوجد مناديب (مستخدمون بدور «مندوب/سائق»). أضِفهم من «فريق العمل».</CardContent></Card>
      ) : (
        <TargetsManager month={month} rows={rows} />
      )}
    </div>
  );
}
