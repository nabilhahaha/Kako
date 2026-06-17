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
import { loadPendingCashHandovers } from '@/lib/van-sales/requests-server';
import { CashHandoverList } from './cash-handover-list';

export const dynamic = 'force-dynamic';

// Confirmer inbox for salesman cash-handover requests (cashier / supervisor).
export default async function CashHandoversPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) notFound();
  if (!(hasPermission(ctx, 'cash.handover.confirm') || ctx.isSuperAdmin)) redirect('/field/van-sales');

  const { t } = await getT();
  const requests = await loadPendingCashHandovers(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales" home="/dashboard" label={t('vanSales.sell.back')} />
      <PageHeader title={t('vanSales.requests.confirm.title')} description={t('vanSales.requests.confirm.subtitle')} />
      <CashHandoverList requests={requests} />
    </div>
  );
}
