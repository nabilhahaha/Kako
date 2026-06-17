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
import { loadRequestCustomers, loadRequestRoutes, loadRequestSalesmen } from '@/lib/van-sales/requests-server';
import { CustomerRequestForms, REQUEST_FORM_KINDS, type RequestFormKind } from '../customer-request-forms';
import { CashRequestForm } from '../cash-request-form';

export const dynamic = 'force-dynamic';

// Title i18n key per dedicated request screen (reuses the existing tile labels).
const TITLE_KEY: Record<RequestFormKind | 'cash', string> = {
  new: 'vanSales.requests.newCustomer',
  update: 'vanSales.requests.updateData',
  gps: 'vanSales.requests.fixLocation',
  credit: 'vanSales.requests.creditChange',
  terms: 'vanSales.requests.termsChange',
  route: 'vanSales.requests.routeTransfer',
  reactivate: 'vanSales.requests.reactivate',
  close: 'vanSales.requests.closeCustomer',
  cash: 'vanSales.requests.cashHandover',
};

/**
 * Dedicated, focused screen for a single request type (mobile-first). Presentation
 * only: the same forms, handlers, validation, and business rules as the hub — just
 * on their own page with a Back button instead of an inline expand. Routing/approval
 * logic is unchanged.
 */
export default async function RequestTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;

  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const isCash = type === 'cash';
  const isCustomer = (REQUEST_FORM_KINDS as string[]).includes(type);
  if (!isCash && !isCustomer) notFound();

  // Same per-type permission gates as the hub.
  const canCash = hasPermission(ctx, 'cash.handover.request') || ctx.isSuperAdmin;
  const canCustomer = hasPermission(ctx, 'customer.request') || ctx.isSuperAdmin;
  if (isCash && !canCash) redirect('/field/van-sales/requests');
  if (isCustomer && !canCustomer) redirect('/field/van-sales/requests');

  const title = t(TITLE_KEY[type as RequestFormKind | 'cash']);

  // Load the data the chosen form needs (customer forms only).
  const [customers, routes, salesmen] = isCustomer
    ? await Promise.all([loadRequestCustomers(ctx), loadRequestRoutes(ctx), loadRequestSalesmen(ctx)])
    : [[], [], []];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales/requests" label={t('vanSales.requests.title')} />
      <PageHeader title={title} />
      {isCash
        ? <CashRequestForm />
        : <CustomerRequestForms customers={customers} routes={routes} salesmen={salesmen} only={type as RequestFormKind} />}
    </div>
  );
}
