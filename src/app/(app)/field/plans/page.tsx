import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { PlansClient, type PlanRoute, type PlanStop, type PlanInfo, type AddCustomer } from './plans-client';

/** Supervisor route planning (FE-3c): pick a route + date, generate the journey
 *  from frequency rules, edit (reorder/skip/add/priority) and publish. */
export default async function RoutePlansPage({ searchParams }: { searchParams: Promise<{ route?: string; date?: string }> }) {
  const { route, date } = await searchParams;
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const companyId = ctx.company?.id;
  if (!companyId || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('field.plans.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.plans.noAccess')}</CardContent></Card></div>;
  }

  const supabase = await createClient();
  const planDate = date || new Date().toISOString().slice(0, 10);

  const { data: routeRows } = await supabase
    .from('erp_routes').select('id, name, rep_id, erp_profiles:rep_id(full_name)')
    .eq('company_id', companyId).eq('is_active', true).order('name');
  const routes: PlanRoute[] = ((routeRows as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string, name: r.name as string, repName: (r.erp_profiles as { full_name?: string } | null)?.full_name ?? null,
  }));

  let plan: PlanInfo | null = null;
  let stops: PlanStop[] = [];
  let customers: AddCustomer[] = [];
  if (route) {
    const { data: planRow } = await supabase.from('erp_fe_route_plans').select('id, status').eq('company_id', companyId).eq('route_id', route).eq('plan_date', planDate).maybeSingle();
    plan = (planRow as PlanInfo | null) ?? null;
    if (plan) {
      const { data: stopRows } = await supabase
        .from('erp_fe_route_stops').select('id, seq, status, priority, due, customer_id, erp_customers(name, code)')
        .eq('plan_id', plan.id).order('seq', { ascending: true });
      stops = ((stopRows as Record<string, unknown>[]) ?? []).map((s) => {
        const c = s.erp_customers as { name?: string; code?: string } | null;
        return { id: s.id as string, seq: s.seq as number, status: s.status as PlanStop['status'], priority: (s.priority as string) ?? 'B', due: s.due as boolean, customerId: s.customer_id as string, customerName: c?.name ?? '—', code: c?.code ?? null };
      });
    }
    const { data: custRows } = await supabase.from('erp_customers').select('id, name, code').eq('is_active', true).eq('route_id', route).order('name').limit(300);
    customers = ((custRows as Record<string, unknown>[]) ?? []).map((c) => ({ id: c.id as string, name: c.name as string, code: (c.code as string) ?? null }));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('field.plans.title')} />
      <PlansClient routes={routes} selectedRoute={route ?? null} date={planDate} plan={plan} stops={stops} customers={customers} />
    </div>
  );
}
