'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, can, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { notifyManagers } from '@/lib/erp/notify';
import { TRADE_SPEND_ENABLED } from '@/lib/trade-spend/flags';
import { APPROVAL_TRADE_SPEND_WF } from '@/lib/erp/approval-flags';

/**
 * Trade-spend governance actions (Critical Action standard).
 *
 * Approve / cancel a trade promotion via a status transition on
 * `erp_trade_promotions` (RLS-scoped to the tenant). Both write an audit row and
 * notify managers. Reason is mandatory on cancellation (accrual-affecting). The
 * module is flag-gated (`TRADE_SPEND_ENABLED`); these are the write counterpart
 * of the read-only dashboard and are registered in the FMCG catalog as
 * `tradeSpend.approve` / `tradeSpend.cancel`.
 */

async function guard(): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  if (!TRADE_SPEND_ENABLED()) return { ok: false, error: 'disabled' };
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !can(ctx, 'pricing.rule.edit')) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId };
}

/**
 * P1: submit a draft promotion for engine-driven approval (flag-gated).
 * Sets status → pending_approval and starts the `trade_spend_approval` workflow
 * (approver: any pricing.manage holder; self-approval blocked, reject reason
 * required). The decision is then made in the Workflow Inbox via the engine; the
 * `trade_promotion` outcome handler flips status to approved/cancelled. When the
 * flag is OFF, callers keep using the legacy direct approveTradeSpend/cancel.
 */
export async function submitTradeSpendForApproval(id: string): Promise<ActionResult> {
  if (!TRADE_SPEND_ENABLED()) return { ok: false, error: 'disabled' };
  if (!APPROVAL_TRADE_SPEND_WF()) return { ok: false, error: 'workflow_disabled' };
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'unauthorized' };
  if (!id) return { ok: false, error: 'missing promotion' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_trade_promotions')
    .update({ status: 'pending_approval' })
    .eq('id', id)
    .eq('status', 'draft');
  if (upErr) return { ok: false, error: friendlyDbError(upErr) };

  const { error: startErr } = await supabase.rpc('erp_workflow_start', {
    p_key: 'trade_spend_approval', p_entity: 'trade_promotion', p_record_id: id, p_context: {},
  });
  if (startErr) return { ok: false, error: friendlyDbError(startErr) };

  await logAudit(supabase, {
    action: 'submit', entity: 'trade_promotion', entityId: id,
    details: { event: 'trade_spend_submitted' }, companyId: ctx.companyId,
  });
  revalidatePath('/distribution/trade-spend');
  revalidatePath('/approvals');
  return { ok: true };
}

export async function approveTradeSpend(id: string, reason?: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  if (!id) return { ok: false, error: 'missing promotion' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_trade_promotions')
    .update({ status: 'approved' })
    .eq('id', id)
    .in('status', ['draft', 'pending']);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'activate', entity: 'trade_promotion', entityId: id,
    details: { event: 'trade_spend_approved', reason: reason?.trim() || null }, companyId: g.companyId,
  });
  await notifyManagers(supabase, g.companyId, {
    type: 'critical_action',
    titleAr: 'اعتماد إنفاق تجاري', titleEn: 'Trade spend approved',
    body: reason?.trim() || '', link: '/distribution/trade-spend', entity: 'trade_promotion', recordId: id,
  });
  revalidatePath('/distribution/trade-spend');
  return { ok: true };
}

export async function cancelTradeSpend(id: string, reason: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  if (!id) return { ok: false, error: 'missing promotion' };
  if (!reason?.trim()) return { ok: false, error: 'reason required' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_trade_promotions')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .not('status', 'eq', 'cancelled');
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'deactivate', entity: 'trade_promotion', entityId: id,
    details: { event: 'trade_spend_cancelled', reason: reason.trim() }, companyId: g.companyId,
  });
  await notifyManagers(supabase, g.companyId, {
    type: 'critical_action',
    titleAr: 'إلغاء إنفاق تجاري', titleEn: 'Trade spend cancelled',
    body: reason.trim(), link: '/distribution/trade-spend', entity: 'trade_promotion', recordId: id,
  });
  revalidatePath('/distribution/trade-spend');
  return { ok: true };
}
