'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive } from './settings-server';
import { dayReopenEnabled } from './sell';

// ============================================================================
// Day Reopen (Phase 1) — governed request/approval actions. Thin wrappers over
// the atomic RPCs (erp_request_day_reopen / erp_decide_day_reopen), which are
// the sole authority (reason-required, latest-closed-day only, one pending per
// day, no self-approval, audited). The wrappers add the enablement gate and
// revalidation; they never change the day state themselves.
// ============================================================================

const RPC_ERRORS: Record<string, string> = {
  'not authorized: day.reopen.request': 'You are not allowed to request a reopen.',
  'not authorized: day.reopen.approve': 'You are not allowed to decide reopen requests.',
  'a reason is required to request a reopen': 'Please enter a reason for the reopen.',
  'only a closed day can be reopened': 'Your day is already open. Please close the day first before requesting to reopen it.',
  'only the latest closed day can be reopened': 'Only the latest closed day can be reopened.',
  'a reopen request is already pending for this day': 'A reopen request is already pending for this day.',
  'you can only request a reopen of your own day': 'You can only request a reopen of your own day.',
  'you cannot decide your own reopen request': 'You cannot decide your own reopen request.',
  'this request has already been decided': 'This request has already been decided.',
};

const friendly = (msg: string): string => RPC_ERRORS[msg] ?? friendlyDbError({ message: msg } as { message: string });

/** Salesman submits a reason-based reopen request for their closed day. */
export async function requestDayReopen(input: { workSessionId: string; reason: string; note?: string }): Promise<ActionResult<{ requestId: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!dayReopenEnabled(await getFeatureFlags(supabase, ctx.companyId!))) return { ok: false, error: 'Day reopen is not enabled.' };
  if (!input.workSessionId) return { ok: false, error: 'Missing day.' };
  if (!input.reason || !input.reason.trim()) return { ok: false, error: 'Please enter a reason for the reopen.' };

  const { data, error } = await supabase.rpc('erp_request_day_reopen', {
    p_work_session_id: input.workSessionId,
    p_reason: input.reason.trim(),
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };

  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string } | undefined;
  if (!row?.request_id) return { ok: false, error: 'Reopen request failed.' };

  revalidatePath('/field/van-sales');
  revalidatePath('/field/van-sales/sell');
  return { ok: true, data: { requestId: row.request_id } };
}

/** Supervisor/Admin approves or rejects a reopen request. */
export async function decideReopenRequest(input: { requestId: string; decision: 'approve' | 'reject'; note?: string }): Promise<ActionResult<{ status: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!dayReopenEnabled(await getFeatureFlags(supabase, ctx.companyId!))) return { ok: false, error: 'Day reopen is not enabled.' };
  if (!input.requestId) return { ok: false, error: 'Missing request.' };
  if (input.decision !== 'approve' && input.decision !== 'reject') return { ok: false, error: 'Invalid decision.' };

  const { data, error } = await supabase.rpc('erp_decide_day_reopen', {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };

  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (!row?.status) return { ok: false, error: 'Decision failed.' };

  revalidatePath('/field/van-sales/reopen-approvals');
  revalidatePath('/field/van-sales');
  return { ok: true, data: { status: row.status } };
}
