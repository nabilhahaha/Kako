import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { returnSlaEnabled } from '@/lib/van-sales/return-sla';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadPendingReturnApprovals } from '@/lib/van-sales/returns-server';
import { ApprovalsQueue } from './approvals-queue';

export const dynamic = 'force-dynamic';

// Approver pending queue (Phase D): held van returns awaiting approve/reject, with
// requester, customer, value, type, matched policy, primary/backup approver and
// SLA age (24h/48h). Gated by the always-on returns.approve permission; the
// decide + first-viewed stamps are server actions with their own guards.
export default async function ReturnApprovalsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'returns.approve') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  const slaEnabled = returnSlaEnabled(flags);
  const res = await loadPendingReturnApprovals();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.approvals.title')} description={t('vanSales.approvals.subtitle')} />
      {!res.ok ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.error}</CardContent></Card>
      ) : (
        <ApprovalsQueue items={res.data ?? []} slaEnabled={slaEnabled} />
      )}
    </div>
  );
}
