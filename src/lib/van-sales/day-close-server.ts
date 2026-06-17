'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, requireActionPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import type { UserContext } from '@/lib/erp/auth-context';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildChain, canActOnStage, dayCloseApprovalEnabled,
  type DayClosePolicy, type DayCloseStage, type DayCloseStatus,
} from './day-close-policy';

// ============================================================================
// End Day Approval & Settlement — server layer (Phase B). Routes End Day through
// the configured chain (submit → stage approvals → close) or the legacy direct
// close. Policy is read from erp_day_close_policies; the pure resolver decides
// the chain + who-can-act. RPCs are the sole authority (lock, advance, audit).
// ============================================================================

const RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  session_not_found: 'Work session not found.',
  not_your_day: 'You can only submit your own day.',
  already_closed: 'This day is already closed.',
  already_submitted: 'This day is already submitted for approval.',
  no_chain: 'No approval chain is configured.',
  request_not_found: 'Day-close request not found.',
  not_current_stage: 'This stage is not the current step.',
  not_pending: 'This day is not awaiting approval.',
  already_acted: 'An approver has already acted — you can no longer withdraw.',
  self_approval: 'You cannot approve your own day.',
  separation_of_duties: 'Separation of duties: you already acted on an earlier stage.',
  reason_required: 'A rejection reason is required.',
  invalid_stage: 'Invalid stage.',
  invalid_decision: 'Invalid decision.',
};

/** Read a company's day-close policy as the normalized, ordered chain. */
export async function loadDayClosePolicy(supabase: SupabaseClient, companyId: string | null | undefined): Promise<DayClosePolicy> {
  if (!companyId) return { mode: 'direct', stages: [], separationOfDuties: false };
  const { data } = await supabase
    .from('erp_day_close_policies')
    .select('mode, supervisor_enabled, reconcile_enabled, settle_enabled, supervisor_role, reconcile_role, settle_role, stage_order, separation_of_duties, sla_hours')
    .eq('company_id', companyId).maybeSingle();
  const p = data as {
    mode: string; supervisor_enabled: boolean; reconcile_enabled: boolean; settle_enabled: boolean;
    supervisor_role: string | null; reconcile_role: string | null; settle_role: string | null;
    stage_order: string[] | null; separation_of_duties: boolean; sla_hours: number | null;
  } | null;
  if (!p) return { mode: 'direct', stages: [], separationOfDuties: false };
  const stages = buildChain({
    mode: p.mode,
    supervisorEnabled: p.supervisor_enabled, reconcileEnabled: p.reconcile_enabled, settleEnabled: p.settle_enabled,
    supervisorRole: p.supervisor_role, reconcileRole: p.reconcile_role, settleRole: p.settle_role,
    stageOrder: p.stage_order,
  });
  return { mode: stages.length ? 'custom' : 'direct', stages, separationOfDuties: p.separation_of_duties === true, slaHours: p.sla_hours };
}

/** Does the company run an approval chain (flag ON + at least one stage)? */
export async function dayCloseChainActive(supabase: SupabaseClient, ctx: UserContext): Promise<{ active: boolean; policy: DayClosePolicy }> {
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  const policy = await loadDayClosePolicy(supabase, ctx.companyId);
  return { active: dayCloseApprovalEnabled(flags) && policy.stages.length > 0, policy };
}

/** Submit End Day for the approval chain (locks the day). Returns the pending status. */
export async function submitDayClose(workSessionId: string): Promise<ActionResult<{ requestId: string; status: DayCloseStatus }>> {
  const { ctx, error } = await requireActionPermission('day.close.submit');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_submit_day_close', { p_work_session_id: workSessionId });
  if (rpcErr) return { ok: false, error: RPC_ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; status: DayCloseStatus } | undefined;
  if (!row?.request_id) return { ok: false, error: 'Submit failed.' };
  revalidatePath('/field/van-sales');
  revalidatePath('/today');
  return { ok: true, data: { requestId: row.request_id, status: row.status } };
}

const ROLES_OF = (ctx: UserContext): string[] => [...new Set(ctx.memberships.map((m) => m.role as string))];

/** Approve / reject a day-close stage. Role + SoD + submitter checks (pure) on top
 *  of the RPC's own guards. */
export async function decideDayCloseStage(input: {
  requestId: string; stage: DayCloseStage; decision: 'approve' | 'reject';
  reason?: string; comment?: string; variance?: number;
}): Promise<ActionResult<{ id: string; status: DayCloseStatus }>> {
  const perm = (`day.close.${input.stage}`) as Parameters<typeof requireActionPermission>[0];
  const { ctx, error } = await requireActionPermission(perm);
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  if (input.decision === 'reject' && !input.reason?.trim()) return { ok: false, error: RPC_ERRORS.reason_required };

  const supabase = await createClient();
  const { data: reqRow } = await supabase
    .from('erp_day_close_requests')
    .select('id, company_id, salesman_id, status')
    .eq('id', input.requestId).maybeSingle();
  const req = reqRow as { id: string; company_id: string; salesman_id: string; status: string } | null;
  if (!req) return { ok: false, error: RPC_ERRORS.request_not_found };

  const policy = await loadDayClosePolicy(supabase, req.company_id);
  const { data: events } = await supabase.from('erp_day_close_stage_events').select('actor').eq('request_id', input.requestId);
  const priorActorIds = [...new Set(((events ?? []) as { actor: string }[]).map((e) => e.actor))];

  const allowed = canActOnStage({
    stage: input.stage, policy,
    userId: ctx.userId, userRoles: ROLES_OF(ctx), userPerms: ctx.permissions,
    submitterId: req.salesman_id, priorActorIds,
    isApex: ctx.isSuperAdmin || ctx.isPlatformOwner,
  });
  if (!allowed) return { ok: false, error: 'You are not authorized for this stage.' };

  const { data, error: rpcErr } = await supabase.rpc('erp_decide_day_close_stage', {
    p_request_id: input.requestId, p_stage: input.stage, p_decision: input.decision,
    p_reason: input.reason ?? null, p_comment: input.comment ?? null,
    p_variance: input.variance ?? null, p_payload: null,
  });
  if (rpcErr) return { ok: false, error: RPC_ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; status: DayCloseStatus } | undefined;
  if (!row?.request_id) return { ok: false, error: 'Decision failed.' };
  revalidatePath('/field/van-sales/day-close-approvals');
  revalidatePath('/field/van-sales');
  return { ok: true, data: { id: row.request_id, status: row.status } };
}

/** Record a cash settlement (full / partial / incremental) on a day-close request.
 *  Independent of the operational close; may run before or after the day closes. */
export async function settleDayCash(input: { requestId: string; settledAmount: number; comment?: string }): Promise<ActionResult<{ settlementStatus: string; outstanding: number; dayStatus: string }>> {
  const { ctx, error } = await requireActionPermission('day.close.settle');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  if (!(Number(input.settledAmount) >= 0)) return { ok: false, error: 'Enter a valid amount.' };

  const supabase = await createClient();
  const { data: reqRow } = await supabase.from('erp_day_close_requests').select('company_id, salesman_id').eq('id', input.requestId).maybeSingle();
  const req = reqRow as { company_id: string; salesman_id: string } | null;
  if (!req) return { ok: false, error: RPC_ERRORS.request_not_found };
  const allowed = await actorAllowed(supabase, ctx, 'settle', input.requestId, req);
  if (!allowed) return { ok: false, error: 'You are not authorized for this stage.' };

  const { data, error: rpcErr } = await supabase.rpc('erp_settle_day_cash', { p_request_id: input.requestId, p_settled_amount: input.settledAmount, p_comment: input.comment ?? null });
  if (rpcErr) return { ok: false, error: RPC_ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { settlement_status: string; outstanding: number; day_status: string } | undefined;
  revalidatePath('/field/van-sales/day-close-approvals');
  return { ok: true, data: { settlementStatus: row?.settlement_status ?? 'pending', outstanding: Number(row?.outstanding ?? 0), dayStatus: row?.day_status ?? '' } };
}

/** Record a physical stock count + variance on a day-close request. Independent of
 *  the operational close. */
export async function reconcileDayStock(input: { requestId: string; countedStock: number; comment?: string }): Promise<ActionResult<{ reconcileStatus: string; variance: number; dayStatus: string }>> {
  const { ctx, error } = await requireActionPermission('day.close.reconcile');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };

  const supabase = await createClient();
  const { data: reqRow } = await supabase.from('erp_day_close_requests').select('company_id, salesman_id').eq('id', input.requestId).maybeSingle();
  const req = reqRow as { company_id: string; salesman_id: string } | null;
  if (!req) return { ok: false, error: RPC_ERRORS.request_not_found };
  const allowed = await actorAllowed(supabase, ctx, 'reconcile', input.requestId, req);
  if (!allowed) return { ok: false, error: 'You are not authorized for this stage.' };

  const { data, error: rpcErr } = await supabase.rpc('erp_reconcile_day_stock', { p_request_id: input.requestId, p_counted_stock: input.countedStock, p_comment: input.comment ?? null });
  if (rpcErr) return { ok: false, error: RPC_ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { reconcile_status: string; variance: number; day_status: string } | undefined;
  revalidatePath('/field/van-sales/day-close-approvals');
  return { ok: true, data: { reconcileStatus: row?.reconcile_status ?? 'reconciled', variance: Number(row?.variance ?? 0), dayStatus: row?.day_status ?? '' } };
}

/** Shared role/SoD/submitter authorization for a track action (pure check helper). */
async function actorAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, ctx: UserContext, stage: DayCloseStage, requestId: string, req: { company_id: string; salesman_id: string },
): Promise<boolean> {
  const policy = await loadDayClosePolicy(supabase, req.company_id);
  const { data: events } = await supabase.from('erp_day_close_stage_events').select('actor').eq('request_id', requestId);
  const priorActorIds = [...new Set(((events ?? []) as { actor: string }[]).map((e) => e.actor))];
  return canActOnStage({
    stage, policy, userId: ctx.userId, userRoles: ROLES_OF(ctx), userPerms: ctx.permissions,
    submitterId: req.salesman_id, priorActorIds, isApex: ctx.isSuperAdmin || ctx.isPlatformOwner,
  });
}

// ── Loaders ──────────────────────────────────────────────────────────────────

export interface MyDayClose {
  requestId: string;
  status: DayCloseStatus;
  submittedAt: string | null;
  supervisorReason: string | null;
  reconcileReason: string | null;
  settleReason: string | null;
  /** The salesman may withdraw ONLY while pending AND no stage has acted yet. */
  canWithdraw: boolean;
}

const PENDING_STATUSES = ['pending_supervisor', 'pending_reconciliation', 'pending_settlement'];

/** The salesman's day-close request for a work session (status + rejection reasons). */
export async function loadMyDayClose(workSessionId: string): Promise<MyDayClose | null> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_day_close_requests')
    .select('id, status, submitted_at, supervisor_reason, reconcile_reason, settle_reason')
    .eq('work_session_id', workSessionId).maybeSingle();
  const r = data as { id: string; status: DayCloseStatus; submitted_at: string | null; supervisor_reason: string | null; reconcile_reason: string | null; settle_reason: string | null } | null;
  if (!r) return null;
  let canWithdraw = PENDING_STATUSES.includes(r.status);
  if (canWithdraw) {
    const { count } = await supabase.from('erp_day_close_stage_events').select('id', { count: 'exact', head: true }).eq('request_id', r.id);
    canWithdraw = (count ?? 0) === 0;
  }
  return { requestId: r.id, status: r.status, submittedAt: r.submitted_at, supervisorReason: r.supervisor_reason, reconcileReason: r.reconcile_reason, settleReason: r.settle_reason, canWithdraw };
}

/** Withdraw a submitted End Day request — only while pending and no stage has acted. */
export async function withdrawDayClose(requestId: string): Promise<ActionResult<{ workSessionId: string }>> {
  const { ctx, error } = await requireActionPermission('day.close.submit');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_withdraw_day_close', { p_request_id: requestId });
  if (rpcErr) return { ok: false, error: RPC_ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { work_session_id: string } | undefined;
  revalidatePath('/field/van-sales');
  revalidatePath('/today');
  return { ok: true, data: { workSessionId: row?.work_session_id ?? '' } };
}

export interface PendingDayCloseRow {
  id: string;
  workSessionId: string;
  salesmanName: string;
  workDate: string | null;
  status: DayCloseStatus;
  stage: DayCloseStage | null;
  submittedAt: string | null;
  stockVariance: number | null;
  cashVariance: number | null;
}

const STAGE_OF: Record<string, DayCloseStage> = {
  pending_supervisor: 'supervisor', pending_reconciliation: 'reconcile', pending_settlement: 'settle',
};

export interface DayCloseReview {
  workDate: string | null;
  /** Inventory reconciliation: system expected closing (total units) + SKU count. */
  expectedStockUnits: number | null;
  skuCount: number | null;
  warehouseName: string | null;
  /** Financial settlement: expected cash = the salesman's collections for the day. */
  expectedCash: number | null;
}

/** Stage review figures for a pending day-close: expected closing stock (from the
 *  van movement ledger) and expected cash (the day's collections). Read-only; the
 *  reviewer enters the physical count / actual cash and the variance is computed. */
export async function loadDayCloseReview(requestId: string): Promise<ActionResult<DayCloseReview>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  const supabase = await createClient();
  const { data: reqRow } = await supabase
    .from('erp_day_close_requests')
    .select('work_session_id, salesman_id')
    .eq('id', requestId).maybeSingle();
  const req = reqRow as { work_session_id: string; salesman_id: string } | null;
  if (!req) return { ok: false, error: RPC_ERRORS.request_not_found };

  const { data: ws } = await supabase.from('erp_work_sessions').select('work_date').eq('id', req.work_session_id).maybeSingle();
  const workDate = (ws as { work_date: string | null } | null)?.work_date ?? new Date().toISOString().slice(0, 10);

  const { loadStockMovementReport } = await import('./stock-movement-server');
  const report = await loadStockMovementReport(supabase, req.salesman_id, workDate, 'en');

  const dayStart = `${workDate}T00:00:00`;
  const dayEnd = `${workDate}T23:59:59`;
  const { data: coll } = await supabase
    .from('erp_collections').select('amount')
    .eq('received_by', req.salesman_id).gte('created_at', dayStart).lte('created_at', dayEnd);
  const expectedCash = ((coll ?? []) as { amount: number }[]).reduce((s, c) => s + Number(c.amount ?? 0), 0);

  return {
    ok: true,
    data: {
      workDate,
      expectedStockUnits: report.totals.current ?? 0,
      skuCount: report.rows.length,
      warehouseName: report.warehouseName,
      expectedCash,
    },
  };
}

/** Pending day-close requests the caller can act on (branch-scoped by RLS). Gated by
 *  holding any day-close stage permission. */
export async function loadPendingDayCloses(): Promise<ActionResult<PendingDayCloseRow[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  const canAny = ['day.close.supervisor', 'day.close.reconcile', 'day.close.settle']
    .some((p) => ctx.permissions.includes(p as (typeof ctx.permissions)[number])) || ctx.isSuperAdmin;
  if (!canAny) return { ok: false, error: 'You do not have permission to review day closes.' };

  const supabase = await createClient();
  const { data, error: qErr } = await supabase
    .from('erp_day_close_requests')
    .select('id, work_session_id, salesman_id, status, submitted_at, stock_variance, cash_variance')
    .in('status', ['pending_supervisor', 'pending_reconciliation', 'pending_settlement'])
    .order('submitted_at', { ascending: true }).limit(200);
  if (qErr) return { ok: false, error: friendlyDbError(qErr) };

  const rows = (data ?? []) as { id: string; work_session_id: string; salesman_id: string; status: DayCloseStatus; submitted_at: string | null; stock_variance: number | null; cash_variance: number | null }[];
  if (rows.length === 0) return { ok: true, data: [] };

  const sIds = [...new Set(rows.map((r) => r.salesman_id))];
  const wsIds = [...new Set(rows.map((r) => r.work_session_id))];
  const [{ data: profs }, { data: sessions }] = await Promise.all([
    supabase.from('erp_profiles').select('id, full_name').in('id', sIds),
    supabase.from('erp_work_sessions').select('id, work_date').in('id', wsIds),
  ]);
  const nameById = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
  const dateById = new Map(((sessions ?? []) as { id: string; work_date: string | null }[]).map((s) => [s.id, s.work_date]));

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      workSessionId: r.work_session_id,
      salesmanName: nameById.get(r.salesman_id) || r.salesman_id.slice(0, 8),
      workDate: dateById.get(r.work_session_id) ?? null,
      status: r.status,
      stage: STAGE_OF[r.status] ?? null,
      submittedAt: r.submitted_at,
      stockVariance: r.stock_variance,
      cashVariance: r.cash_variance,
    })),
  };
}
