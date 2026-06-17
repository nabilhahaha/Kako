import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadPendingDayCloses } from '@/lib/van-sales/day-close-server';
import { DayCloseQueue } from './day-close-queue';

export const dynamic = 'force-dynamic';

const STAGE_PERMS: Permission[] = ['day.close.supervisor', 'day.close.reconcile', 'day.close.settle'];

// End Day Approval queue (Phase B/D): held day-close requests awaiting a stage the
// caller can act on (Supervisor Review · Inventory Reconciliation · Financial
// Settlement). Gated by holding any stage permission; branch-scoped by RLS.
export default async function DayCloseApprovalsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  const canAny = STAGE_PERMS.some((p) => hasPermission(ctx, p)) || ctx.isSuperAdmin;
  if (!canAny) redirect('/dashboard');

  const { t } = await getT();
  const res = await loadPendingDayCloses();
  // Which stages may this user act on? (drives which rows show actions)
  const actable = STAGE_PERMS.filter((p) => hasPermission(ctx, p) || ctx.isSuperAdmin)
    .map((p) => p.replace('day.close.', '')) as ('supervisor' | 'reconcile' | 'settle')[];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.dayClose.title')} description={t('vanSales.dayClose.subtitle')} />
      {!res.ok ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.error}</CardContent></Card>
      ) : (
        <DayCloseQueue items={res.data ?? []} actableStages={actable} />
      )}
    </div>
  );
}
