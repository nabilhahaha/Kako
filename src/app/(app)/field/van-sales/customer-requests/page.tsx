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
import { loadPendingCustomerRequests } from '@/lib/van-sales/requests-server';
import { CustomerRequestList } from './customer-request-list';

export const dynamic = 'force-dynamic';

// Approver inbox for governed customer requests (new / data update / GPS).
// Approve applies the master-data change server-side; reject leaves it unchanged.
export default async function CustomerRequestsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) notFound();
  if (!(hasPermission(ctx, 'customer.request.approve') || ctx.isSuperAdmin)) redirect('/field/van-sales');

  const { t } = await getT();
  const requests = await loadPendingCustomerRequests(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
      <PageHeader title={t('vanSales.requests.custInbox.title')} description={t('vanSales.requests.custInbox.subtitle')} />
      <CustomerRequestList requests={requests} />
    </div>
  );
}
