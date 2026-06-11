'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, can, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { notifyManagers } from '@/lib/erp/notify';
import { TRADE_SPEND_ENABLED } from '@/lib/trade-spend/flags';

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
