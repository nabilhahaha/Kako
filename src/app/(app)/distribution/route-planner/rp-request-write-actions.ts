'use server';

// ============================================================================
// Phase D2 — Route Planner request WRITE flows (submit / decide). Restrictive posture
// consistent with D1:
//   * submit  → any authenticated company member (RLS: requested_by = self);
//   * decide  → company admin OR a managerial RP access role; never the requester
//               (self-approval is blocked).
// Company-scoped; DB RLS on erp_route_planner_requests (0356: company scope +
// admin/assignee/requester) is the backstop. Reuses the existing approval concepts; the
// global approval engine is NOT modified. No new migrations.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { rpCanDecideRequests } from '@/lib/erp/route-planner-access';
import { RP_REQUEST_TYPES, type RpRequestType } from './rp-requests-read-actions';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
}
/** Restrictive: admin OR an explicit managerial RP role may decide. No row + non-admin → no. */
function canDecide(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return rpCanDecideRequests(ctx.routePlannerAccess?.role ?? null, isAdmin(ctx));
}

export interface RequestPerms { canSubmit: boolean; canDecide: boolean; meId: string }

export async function getMyRequestPerms(): Promise<ResultD<RequestPerms>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  return { ok: true, data: { canSubmit: true, canDecide: canDecide(ctx), meId: ctx.userId } };
}

/** Submit a Route Planner request (routing/tracking record). Any company member; the row
 *  is owned by the submitter (RLS requires requested_by = auth.uid()). */
export async function submitRequest(input: { type: RpRequestType; customerRef?: string | null; reason: string }): Promise<ResultD<{ id: string }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!RP_REQUEST_TYPES.includes(input.type)) return { ok: false, error: 'err_bad_type' };
  const reason = input.reason?.trim();
  if (!reason) return { ok: false, error: 'err_reason_required' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_route_planner_requests').insert({
    company_id: ctx.companyId,
    requested_by: ctx.userId,
    type: input.type,
    customer_ref: input.customerRef?.trim() || null,
    reason,
    status: 'pending_manager_review',
    events: [{ kind: 'submitted', by: ctx.userId, at: new Date().toISOString() }],
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, data: { id: data.id as string } };
}

const DECISION_STATUS = { approve: 'approved', reject: 'rejected', need_info: 'need_more_info' } as const;
export type RequestDecision = keyof typeof DECISION_STATUS;

/** Decide a request (approve / reject / need-more-info). Managerial/admin only, and never
 *  the requester (self-approval blocked). Company-scoped; RLS backstop. */
export async function decideRequest(requestId: string, decision: RequestDecision, note?: string): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!canDecide(ctx)) return { ok: false, error: 'err_no_decide_perm' };
  if (!(decision in DECISION_STATUS)) return { ok: false, error: 'err_bad_decision' };
  const sb = await createClient();
  const { data: req, error: e1 } = await sb.from('erp_route_planner_requests')
    .select('requested_by, status, events').eq('id', requestId).eq('company_id', ctx.companyId).maybeSingle();
  if (e1 || !req) return { ok: false, error: e1?.message ?? 'err_not_found' };
  if ((req.requested_by as string) === ctx.userId) return { ok: false, error: 'err_self_approval' };
  const events = Array.isArray(req.events) ? (req.events as unknown[]) : [];
  events.push({ kind: decision, by: ctx.userId, at: new Date().toISOString(), note: note?.trim() || undefined });
  const { error } = await sb.from('erp_route_planner_requests')
    .update({ status: DECISION_STATUS[decision], events, updated_at: new Date().toISOString() })
    .eq('id', requestId).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
