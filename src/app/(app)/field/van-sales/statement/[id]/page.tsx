import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { visitDrivenRouteEnabled, smartNextCustomerEnabled, creditOverrideEnabled } from '@/lib/van-sales/sell';
import { BackLink } from '@/components/shared/back-link';
import { loadCustomerStatement } from '@/lib/erp/customer-statement-server';
import { CustomerStatementView, type VisitContext, type VisitCockpitData } from '@/components/customers/customer-statement';
import { getT } from '@/lib/i18n/server';

const ACTIVE_INV = ['issued', 'paid', 'partially_paid', 'overdue'];

export const dynamic = 'force-dynamic';

// Salesman-facing customer statement (mobile) = the visit context. Same
// authoritative builder + component as the desktop customer page; branch-scoped by
// RLS, gated by field.sales. When opened from the route (?from=route) AND the
// visit-driven flag is on, it shows the route banner + Complete Visit (Phase 1).
export default async function VanStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; seq?: string; total?: string; next?: string; nextName?: string; src?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { id } = await params;
  const sp = await searchParams;
  const { t } = await getT();

  const res = await loadCustomerStatement(supabase, id);
  if (!res) notFound();

  // ── Visit cockpit context: customer card fields + last visit/invoice + sales ──
  const todayIso = new Date().toISOString().slice(0, 10);
  const thisMonthStart = `${todayIso.slice(0, 7)}-01`;
  const lmDate = new Date();
  lmDate.setDate(1);
  lmDate.setMonth(lmDate.getMonth() - 1);
  const lastMonthStart = `${lmDate.toISOString().slice(0, 7)}-01`;
  const [custRow, lastVisitRow, lastInvRow, salesRows] = await Promise.all([
    supabase.from('erp_customers').select('phone, city, latitude, longitude').eq('id', id).maybeSingle(),
    supabase.from('erp_visits').select('visit_date').eq('customer_id', id).eq('salesman_id', ctx.userId).lt('visit_date', todayIso).order('visit_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('erp_invoices').select('created_at, net_amount').eq('customer_id', id).in('status', ACTIVE_INV).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('erp_invoices').select('created_at, net_amount, status').eq('customer_id', id).in('status', ACTIVE_INV).gte('created_at', `${lastMonthStart}T00:00:00`),
  ]);
  const cust = custRow.data as { phone: string | null; city: string | null; latitude: number | null; longitude: number | null } | null;
  let salesThisMonth = 0;
  let salesLastMonth = 0;
  for (const r of (salesRows.data ?? []) as { created_at: string; net_amount: number }[]) {
    const d = String(r.created_at).slice(0, 10);
    const amt = Number(r.net_amount ?? 0);
    if (d >= thisMonthStart) salesThisMonth += amt;
    else salesLastMonth += amt;
  }
  const lastInv = lastInvRow.data as { created_at: string; net_amount: number } | null;
  const cockpit: VisitCockpitData = {
    name: res.customer.name_ar || res.customer.name,
    code: res.customer.code ?? null,
    area: cust?.city ?? null,
    phone: cust?.phone ?? null,
    lat: cust?.latitude ?? null,
    lng: cust?.longitude ?? null,
    lastVisitDate: (lastVisitRow.data as { visit_date: string } | null)?.visit_date ?? null,
    lastInvoiceDate: lastInv ? String(lastInv.created_at).slice(0, 10) : null,
    lastInvoiceAmount: lastInv ? Number(lastInv.net_amount ?? 0) : null,
    salesThisMonth,
    salesLastMonth,
  };

  // Visit context only when arrived from the route and the flag is on.
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  // Smart Next Customer (flag-gated): Complete Visit lands on the route-first
  // suggestions instead of the route screen, and the marker drives Resume Visit.
  const smartNext = smartNextCustomerEnabled(flags);
  // Admin Credit Override (flag + role): an authorized role may bypass a credit
  // block to record a cash sale when company policy permits.
  const canOverrideCredit = creditOverrideEnabled(flags) && (hasPermission(ctx, 'customers.change_status') || ctx.isSuperAdmin);
  const visit: VisitContext | undefined =
    sp.from === 'route' && visitDrivenRouteEnabled(flags)
      ? {
          customerId: id,
          seq: Math.max(1, Number(sp.seq) || 1),
          total: Math.max(1, Number(sp.total) || 1),
          nextName: sp.nextName ?? null,
          completeHref: smartNext
            ? `/field/next?done=${id}`
            : sp.next ? `/field/journey?focus=${sp.next}` : '/field/journey',
          trackResume: smartNext,
          customerName: res.customer.name_ar || res.customer.name,
          source: sp.src || 'route',
        }
      : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <BackLink href={visit ? '/field/journey' : '/field/van-sales'} home="/today" label={visit ? t('vanSales.visit.backToRoute') : t('vanSales.sell.back')} />
      <CustomerStatementView
        statement={res.statement}
        printHref={`/print/statement/${id}`}
        collectHref={`/field/van-sales/collect?customer=${id}`}
        sellHref={`/field/van-sales/sell?customer=${id}`}
        returnHref={`/field/van-sales/return?customer=${id}`}
        canCollect={hasPermission(ctx, 'sales.collect') || ctx.isSuperAdmin}
        visit={visit}
        variant="field"
        cockpit={cockpit}
        canOverrideCredit={canOverrideCredit}
      />
    </div>
  );
}
