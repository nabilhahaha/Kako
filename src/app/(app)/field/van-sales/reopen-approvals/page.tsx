import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { dayReopenEnabled } from '@/lib/van-sales/sell';
import { loadPendingDayReopens } from '@/lib/van-sales/day-server';
import { ReopenApprovalList } from './reopen-approval-list';

export const dynamic = 'force-dynamic';

// Approver inbox for governed day-reopen requests. Gated by the platform flag +
// day.reopen.approve. Read here, decide via the atomic RPC (audited).
export default async function ReopenApprovalsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();

  const flags = await getFeatureFlags(supabase, ctx.companyId!);
  if (!dayReopenEnabled(flags)) notFound();
  if (!(hasPermission(ctx, 'day.reopen.approve') || ctx.isSuperAdmin)) redirect('/field/van-sales');

  const { t } = await getT();
  const requests = await loadPendingDayReopens(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
      <PageHeader title={t('vanSales.reopen.approvals.title')} description={t('vanSales.reopen.approvals.subtitle')} />
      <ReopenApprovalList requests={requests} />
    </div>
  );
}
