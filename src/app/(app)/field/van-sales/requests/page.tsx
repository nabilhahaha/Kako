import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { salesmanRequestsEnabled } from '@/lib/van-sales/sell';
import { loadMyRequests, loadRequestCustomers, loadRequestRoutes } from '@/lib/van-sales/requests-server';
import { loadVanDayState } from '@/lib/van-sales/day-server';
import { RequestsHub } from './requests-hub';

export const dynamic = 'force-dynamic';

// Salesman Requests hub — one place for the salesman's operational requests
// (Load · Cash handover · Reopen day; more later). Flag-gated
// (platform.salesman_requests) + field.sales. A facade over the existing
// backends; no transaction/accounting change.
export default async function RequestsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const canCustomer = hasPermission(ctx, 'customer.request') || ctx.isSuperAdmin;
  const [myRequests, { state }, customers, routes] = await Promise.all([
    loadMyRequests(ctx), loadVanDayState(ctx),
    canCustomer ? loadRequestCustomers(ctx) : Promise.resolve([]),
    canCustomer ? loadRequestRoutes(ctx) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" label={t('vanSales.sell.back')} />
      <PageHeader title={t('vanSales.requests.title')} description={t('vanSales.requests.subtitle')} />
      <RequestsHub
        myRequests={myRequests}
        canLoad={hasPermission(ctx, 'stock_request.create') || ctx.isSuperAdmin}
        canCash={hasPermission(ctx, 'cash.handover.request') || ctx.isSuperAdmin}
        canReopen={hasPermission(ctx, 'day.reopen.request') || ctx.isSuperAdmin}
        dayClosed={state === 'closed'}
        canCustomer={canCustomer}
        customers={customers}
        routes={routes}
      />
    </div>
  );
}
