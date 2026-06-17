import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadDayCloseSettlementBoard } from '@/lib/van-sales/day-close-server';
import { SettlementBoard } from './settlement-board';

export const dynamic = 'force-dynamic';

// Settlement & custody board: open cash settlements (pending/partial) and due
// inventory reconciliations REGARDLESS of day status — so cashiers/warehouse can
// act on already-closed days. Powers Outstanding-Cash-by-salesman. Gated by holding
// the settle or reconcile permission.
export default async function DayCloseSettlementPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  const canSettle = hasPermission(ctx, 'day.close.settle') || ctx.isSuperAdmin;
  const canReconcile = hasPermission(ctx, 'day.close.reconcile') || ctx.isSuperAdmin;
  if (!canSettle && !canReconcile) redirect('/dashboard');

  const { t } = await getT();
  const res = await loadDayCloseSettlementBoard();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.settlement.title')} description={t('vanSales.settlement.subtitle')} />
      {!res.ok ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.error}</CardContent></Card>
      ) : (
        <SettlementBoard rows={res.data ?? []} canSettle={canSettle} canReconcile={canReconcile} />
      )}
    </div>
  );
}
