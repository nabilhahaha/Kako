import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import type { Branch, ErpCustomer, ProductCatalog } from '@/lib/erp/types';
import { RepTerminal, type PlanCustomer } from './rep-terminal';

const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default async function RepPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const today = new Date();
  const todayCode = DAY_CODES[today.getDay()];
  const todayStr = today.toISOString().slice(0, 10);

  const [{ data: customers }, { data: branches }, { data: products }, { data: vans }, { data: visits }, { data: session }] =
    await Promise.all([
      supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_warehouses').select('id, name, name_ar, branch_id').eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true),
      supabase.from('erp_visits').select('customer_id').eq('salesman_id', ctx.userId).eq('visit_date', todayStr),
      supabase.from('erp_work_sessions').select('status').eq('salesman_id', ctx.userId).eq('work_date', todayStr).maybeSingle(),
    ]);

  const allCustomers = (customers as ErpCustomer[]) ?? [];
  const van = (vans ?? [])[0];
  const sourceLabel = van ? `سيارتك (${van.name_ar || van.name})` : 'مخزن الفرع';
  const status = (session as { status?: string } | null)?.status;
  const dayStatus: 'none' | 'open' | 'closed' = status === 'open' ? 'open' : status === 'closed' ? 'closed' : 'none';

  // Today's planned visits for this rep.
  const todayPlan: PlanCustomer[] = allCustomers
    .filter((c) => c.salesman_id === ctx.userId && c.visit_day === todayCode)
    .map((c) => ({ id: c.id, name: c.name_ar || c.name }));
  const visitedToday = [...new Set((visits ?? []).map((v) => v.customer_id))];

  return (
    <RepTerminal
      customers={allCustomers}
      branches={(branches as Branch[]) ?? []}
      products={(products as ProductCatalog[]) ?? []}
      sourceLabel={sourceLabel}
      todayPlan={todayPlan}
      visitedToday={visitedToday}
      dayStatus={dayStatus}
      vanId={van?.id ?? null}
      repId={ctx.userId}
    />
  );
}
