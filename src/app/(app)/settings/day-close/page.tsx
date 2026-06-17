import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { dayCloseApprovalEnabled } from '@/lib/van-sales/day-close-policy';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { DayClosePolicyManager, type DayClosePolicyView } from './day-close-policy-manager';

export const dynamic = 'force-dynamic';

/**
 * End Day Close policy console (Company-Admin / Platform-Owner). Configure the MODE
 * (Direct vs the approval chain), which stages are enabled, the ROLE assigned to each
 * stage (not hardcoded — supervisor/warehouse/cashier/branch_manager/accountant/any),
 * the order, separation-of-duties, variance tolerances and SLA. Company-policy layer
 * of capability → policy → permission; the pure resolver reads exactly this data.
 */
export default async function DayCloseSettingsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  const { data } = await supabase
    .from('erp_day_close_policies')
    .select('mode, supervisor_enabled, reconcile_enabled, settle_enabled, supervisor_role, reconcile_role, settle_role, stage_order, separation_of_duties, cash_variance_tol, stock_variance_tol, sla_hours, settle_blocks_close, reconcile_blocks_close, allow_partial_settlement, auto_carry_forward, reconcile_cadence, custody_escalation_days')
    .eq('company_id', ctx.companyId ?? '').maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = data as any;
  const policy: DayClosePolicyView = {
    mode: (p?.mode as 'direct' | 'custom') ?? 'direct',
    supervisorEnabled: p?.supervisor_enabled ?? false,
    reconcileEnabled: p?.reconcile_enabled ?? false,
    settleEnabled: p?.settle_enabled ?? false,
    supervisorRole: p?.supervisor_role ?? 'supervisor',
    reconcileRole: p?.reconcile_role ?? 'warehouse_keeper',
    settleRole: p?.settle_role ?? 'cashier',
    stageOrder: (p?.stage_order as string[]) ?? ['supervisor', 'reconcile', 'settle'],
    separationOfDuties: p?.separation_of_duties ?? false,
    cashVarianceTol: p?.cash_variance_tol ?? null,
    stockVarianceTol: p?.stock_variance_tol ?? null,
    slaHours: p?.sla_hours ?? null,
    settleBlocksClose: p?.settle_blocks_close ?? false,
    reconcileBlocksClose: p?.reconcile_blocks_close ?? false,
    allowPartialSettlement: p?.allow_partial_settlement ?? true,
    autoCarryForward: p?.auto_carry_forward ?? true,
    reconcileCadence: (p?.reconcile_cadence as DayClosePolicyView['reconcileCadence']) ?? 'daily',
    custodyEscalationDays: p?.custody_escalation_days ?? 7,
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('dayClosePolicy.title')} description={t('dayClosePolicy.description')} />
      <DayClosePolicyManager policy={policy} flagOn={dayCloseApprovalEnabled(flags)} />
    </div>
  );
}
