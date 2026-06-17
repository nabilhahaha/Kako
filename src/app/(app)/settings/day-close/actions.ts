'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';

// End Day Close policy configuration (Company-Admin / Platform-Owner). Company-scoped
// server-side; RLS independently isolates tenants. Audited. This is the data the
// pure resolver (day-close-policy.ts) reads — nothing hardcoded.

interface AdminGuard { ok: true; companyId: string; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }

async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  if (!hasPermission(ctx, 'settings.workflow_policy') || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId, userId: ctx.userId, supabase: await createClient() };
}

const STAGES = ['supervisor', 'reconcile', 'settle'] as const;

export interface DayClosePolicyInput {
  mode: 'direct' | 'custom';
  supervisorEnabled: boolean; reconcileEnabled: boolean; settleEnabled: boolean;
  supervisorRole: string | null; reconcileRole: string | null; settleRole: string | null;
  stageOrder: string[];
  separationOfDuties: boolean;
  cashVarianceTol: number | null;
  stockVarianceTol: number | null;
  slaHours: number | null;
  // Separated-model flags: tracks gate the close only when their *_blocks_close is on.
  settleBlocksClose: boolean;
  reconcileBlocksClose: boolean;
  allowPartialSettlement: boolean;
  autoCarryForward: boolean;
  reconcileCadence: 'daily' | 'weekly' | 'monthly' | 'surprise' | 'not_required';
  custodyEscalationDays: number | null;
}

const CADENCES = ['daily', 'weekly', 'monthly', 'surprise', 'not_required'] as const;

/** Upsert the company's End Day close policy. */
export async function saveDayClosePolicy(input: DayClosePolicyInput): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (input.mode !== 'direct' && input.mode !== 'custom') return { ok: false, error: 'invalid_mode' };

  const order = (input.stageOrder ?? []).filter((s) => (STAGES as readonly string[]).includes(s));
  const stageOrder = [...order, ...STAGES.filter((s) => !order.includes(s))];

  const { error } = await g.supabase.from('erp_day_close_policies').upsert({
    company_id: g.companyId,
    mode: input.mode,
    supervisor_enabled: input.mode === 'custom' && input.supervisorEnabled,
    reconcile_enabled: input.mode === 'custom' && input.reconcileEnabled,
    settle_enabled: input.mode === 'custom' && input.settleEnabled,
    supervisor_role: input.supervisorRole || null,
    reconcile_role: input.reconcileRole || null,
    settle_role: input.settleRole || null,
    stage_order: stageOrder,
    separation_of_duties: input.separationOfDuties === true,
    cash_variance_tol: input.cashVarianceTol,
    stock_variance_tol: input.stockVarianceTol,
    sla_hours: input.slaHours,
    settle_blocks_close: input.settleBlocksClose === true,
    reconcile_blocks_close: input.reconcileBlocksClose === true,
    allow_partial_settlement: input.allowPartialSettlement !== false,
    auto_carry_forward: input.autoCarryForward !== false,
    reconcile_cadence: CADENCES.includes(input.reconcileCadence) ? input.reconcileCadence : 'daily',
    custody_escalation_days: input.custodyEscalationDays != null && input.custodyEscalationDays > 0 ? Math.trunc(input.custodyEscalationDays) : 7,
    updated_at: new Date().toISOString(),
    updated_by: g.userId,
  }, { onConflict: 'company_id' });
  if (error) return { ok: false, error: error.message };

  await logAudit(g.supabase, {
    action: 'day_close_policy.update', entity: 'day_close_policy', entityId: g.companyId,
    details: { mode: input.mode, sod: input.separationOfDuties }, companyId: g.companyId,
  });
  revalidatePath('/settings/day-close');
  return { ok: true };
}
