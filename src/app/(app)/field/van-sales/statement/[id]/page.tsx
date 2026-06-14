import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { visitDrivenRouteEnabled } from '@/lib/van-sales/sell';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { loadCustomerStatement } from '@/lib/erp/customer-statement-server';
import { CustomerStatementView, type VisitContext } from '@/components/customers/customer-statement';
import { getT } from '@/lib/i18n/server';

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
  searchParams: Promise<{ from?: string; seq?: string; total?: string; next?: string; nextName?: string }>;
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

  // Visit context only when arrived from the route and the flag is on.
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  const visit: VisitContext | undefined =
    sp.from === 'route' && visitDrivenRouteEnabled(flags)
      ? {
          customerId: id,
          seq: Math.max(1, Number(sp.seq) || 1),
          total: Math.max(1, Number(sp.total) || 1),
          nextName: sp.nextName ?? null,
          completeHref: sp.next ? `/field/journey?focus=${sp.next}` : '/field/journey',
        }
      : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <BackLink href={visit ? '/field/journey' : '/field/van-sales'} label={visit ? t('vanSales.visit.backToRoute') : t('vanSales.sell.back')} />
      <PageHeader
        title={t('customers.stmtTitle', { name: res.customer.name_ar || res.customer.name })}
        description={res.customer.code}
      />
      <CustomerStatementView
        statement={res.statement}
        printHref={`/print/statement/${id}`}
        collectHref={`/field/van-sales/collect?customer=${id}`}
        sellHref={`/field/van-sales/sell?customer=${id}`}
        returnHref={`/field/van-sales/return?customer=${id}`}
        canCollect={hasPermission(ctx, 'sales.collect') || ctx.isSuperAdmin}
        visit={visit}
      />
    </div>
  );
}
