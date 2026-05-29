import { redirect } from 'next/navigation';
import { requireAnyPermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { RoutesManager, type RouteRow, type RepOpt, type VanOpt } from './routes-manager';

export default async function RoutesPage() {
  await requireAnyPermission(['reports.view', 'customers.manage']);
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="خطوط السير" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const supabase = await createClient();
  const [{ data: routes }, { data: reps }, { data: vans }, { data: custs }] = await Promise.all([
    supabase.from('erp_routes').select('id, name, rep_id, van_warehouse_id, visit_day, is_active').order('name'),
    supabase.rpc('erp_company_reps'),
    supabase.from('erp_warehouses').select('id, name, name_ar').eq('is_van', true).order('name'),
    supabase.from('erp_customers').select('route_id'),
  ]);
  const counts = new Map<string, number>();
  for (const c of (custs as { route_id: string | null }[]) ?? []) if (c.route_id) counts.set(c.route_id, (counts.get(c.route_id) ?? 0) + 1);
  const repList = (reps as RepOpt[]) ?? [];
  const vanList = ((vans as { id: string; name: string; name_ar: string | null }[]) ?? []).map((v) => ({ id: v.id, name: v.name_ar || v.name }));
  const rows: RouteRow[] = ((routes as { id: string; name: string; rep_id: string | null; van_warehouse_id: string | null; visit_day: string | null; is_active: boolean }[]) ?? [])
    .map((r) => ({ ...r, customers: counts.get(r.id) ?? 0 }));

  return (
    <div>
      <PageHeader title="خطوط السير / المناطق" description="جمّع عملاءك تحت خط سير بمندوب وعربية ويوم زيارة." />
      <RoutesManager routes={rows} reps={repList} vans={vanList} />
    </div>
  );
}
