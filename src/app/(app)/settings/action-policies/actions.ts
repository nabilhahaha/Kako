'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getActionPolicy } from '@/lib/erp/action-policy';
import { getUserContext } from '@/lib/erp/auth-context';
import { CRITICAL_ACTIONS_BY_KEY } from '@/lib/erp/critical-actions-catalog';

/**
 * Admin write API for tenant Critical-Action policies (`erp_action_policies`).
 *
 * Company-Admin / Platform-Owner only (mirrors the Authz Console guard). All
 * writes are company-scoped server-side (company_id is taken from the session,
 * never the client) and audited; RLS independently enforces tenant isolation.
 */

interface AdminGuard {
  ok: true;
  companyId: string;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId, userId: ctx.userId, supabase: await createClient() };
}

/** The effective policy knobs a client flow needs before running an action.
 *  Any authenticated user may resolve their OWN company's effective policy
 *  (RLS-scoped); used to drive the Critical Action confirm/reason/enabled UX. */
export interface ActionPolicyConfig {
  enabled: boolean;
  reasonRequired: boolean;
  approvalRequired: boolean;
  irreversible: boolean;
  reversalAllowed: boolean;
}

export async function loadActionPolicyConfig(actionKey: string): Promise<ActionPolicyConfig> {
  const ctx = await getUserContext();
  const supabase = await createClient();
  const p = await getActionPolicy(supabase, ctx?.companyId, actionKey);
  return {
    enabled: p.enabled,
    reasonRequired: p.reasonRequired,
    approvalRequired: p.approvalRequired,
    irreversible: p.reversalPolicy === 'irreversible',
    reversalAllowed: p.reversalAllowed,
  };
}

const RISKS = ['low', 'medium', 'high', 'critical'];
const REVERSALS = ['reversible', 'reverse_entry', 'approval_to_reverse', 'irreversible'];
const VALID_TARGETS = new Set([
  'customer', 'salesman', 'supervisor', 'branch_manager', 'sales_manager',
  'finance', 'inventory_controller', 'company_admin', 'approver_queue',
]);

export interface ActionPolicyInput {
  actionKey: string;
  enabled: boolean;
  risk: string;
  reasonRequired: boolean;
  approvalRequired: boolean;
  notifyTargets: string[];
  escalationTargets: string[];
  reversalAllowed: boolean;
  reversalPolicy: string;
  /** ISO date (yyyy-mm-dd) or empty → now. */
  effectiveFrom?: string | null;
}

/** Create/replace the open (effective_to IS NULL) policy row for an action. */
export async function saveActionPolicy(input: ActionPolicyInput): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;

  if (!CRITICAL_ACTIONS_BY_KEY[input.actionKey]) return { ok: false, error: 'unknown_action' };
  if (!RISKS.includes(input.risk)) return { ok: false, error: 'invalid_risk' };
  if (!REVERSALS.includes(input.reversalPolicy)) return { ok: false, error: 'invalid_reversal' };
  const notify = [...new Set(input.notifyTargets)].filter((x) => VALID_TARGETS.has(x));
  const escalation = [...new Set(input.escalationTargets)].filter((x) => VALID_TARGETS.has(x));

  const row = {
    company_id: companyId,
    action_key: input.actionKey,
    enabled: input.enabled,
    risk_level: input.risk,
    reason_required: input.reasonRequired,
    approval_required: input.approvalRequired,
    notify_targets: notify,
    escalation_targets: escalation,
    reversal_allowed: input.reversalAllowed,
    reversal_policy: input.reversalPolicy,
    effective_from: input.effectiveFrom?.trim() ? input.effectiveFrom : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  // Update the existing open row in place, else insert one.
  const { data: existing } = await supabase
    .from('erp_action_policies')
    .select('id')
    .eq('company_id', companyId)
    .eq('action_key', input.actionKey)
    .is('effective_to', null)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from('erp_action_policies').update(row).eq('id', (existing as { id: string }).id)
    : await supabase.from('erp_action_policies').insert(row);
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: 'update', entity: 'action_policy', entityId: input.actionKey,
    details: { risk: input.risk, reason_required: input.reasonRequired, approval_required: input.approvalRequired,
      enabled: input.enabled, reversal_policy: input.reversalPolicy },
    companyId,
  });
  revalidatePath('/settings/action-policies');
  return { ok: true };
}

/** Remove the override → the action reverts to the catalog default. */
export async function resetActionPolicy(actionKey: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;
  if (!CRITICAL_ACTIONS_BY_KEY[actionKey]) return { ok: false, error: 'unknown_action' };

  const { error } = await supabase
    .from('erp_action_policies')
    .delete()
    .eq('company_id', companyId)
    .eq('action_key', actionKey)
    .is('effective_to', null);
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: 'delete', entity: 'action_policy', entityId: actionKey,
    details: { event: 'reset_to_default' }, companyId,
  });
  revalidatePath('/settings/action-policies');
  return { ok: true };
}
