'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, requireActionPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

// ============================================================================
// Override & Reopen Center — controlled, audited exception actions. NO silent
// bypass: every override REQUIRES a reason, is audited, records the actor/time,
// and surfaces in the reports. Authorized users only (returns.override /
// day.close.override / day.reopen). The RPCs are the sole authority.
// ============================================================================

const ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  reason_required: 'A reason is required for every override.',
  invalid_decision: 'Invalid decision.',
  return_not_found: 'Return not found.',
  already_completed: 'This return is already completed.',
  no_van_assigned: 'No van is assigned to the requester.',
  request_not_found: 'Day-close request not found.',
  already_closed: 'This day is already closed.',
  not_closed: 'This day is not closed.',
};

/** Force-approve (post) or force-reject a return — authorized override, audited. */
export async function overrideReturn(input: { returnId: string; decision: 'approve' | 'reject'; reason: string; comment?: string }): Promise<ActionResult<{ status: string }>> {
  const { ctx, error } = await requireActionPermission('returns.override');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  if (!input.reason?.trim()) return { ok: false, error: ERRORS.reason_required };
  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_override_van_return', {
    p_return_id: input.returnId, p_decision: input.decision, p_reason: input.reason.trim(), p_comment: input.comment?.trim() || null,
  });
  if (rpcErr) return { ok: false, error: ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  revalidatePath('/field/van-sales/override-center');
  return { ok: true, data: { status: row?.status ?? '' } };
}

/** Force-close a stuck day-close — authorized override, audited. */
export async function forceCloseDay(input: { requestId: string; reason: string; comment?: string }): Promise<ActionResult<{ status: string }>> {
  const { ctx, error } = await requireActionPermission('day.close.override');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  if (!input.reason?.trim()) return { ok: false, error: ERRORS.reason_required };
  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_override_day_close', { p_request_id: input.requestId, p_reason: input.reason.trim(), p_comment: input.comment?.trim() || null });
  if (rpcErr) return { ok: false, error: ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  revalidatePath('/field/van-sales/override-center');
  return { ok: true, data: { status: row?.status ?? '' } };
}

/** Reopen a CLOSED day — authorized, audited. */
export async function reopenClosedDay(input: { requestId: string; reason: string; comment?: string }): Promise<ActionResult<{ status: string }>> {
  const { ctx, error } = await requireActionPermission('day.reopen');
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  if (!input.reason?.trim()) return { ok: false, error: ERRORS.reason_required };
  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_reopen_day_close', { p_request_id: input.requestId, p_reason: input.reason.trim(), p_comment: input.comment?.trim() || null });
  if (rpcErr) return { ok: false, error: ERRORS[rpcErr.message] ?? friendlyDbError(rpcErr) };
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  revalidatePath('/field/van-sales/override-center');
  return { ok: true, data: { status: row?.status ?? '' } };
}

// ── Override queue ───────────────────────────────────────────────────────────

export interface OverrideReturnRow {
  id: string; document: string; customer: string; value: number;
  requestedBy: string; requestedAt: string | null; reason: string | null; status: string;
}
export interface OverrideDayRow {
  id: string; document: string; salesman: string; value: number | null;
  requestedAt: string | null; status: string; closed: boolean;
}
export interface OverrideQueue {
  canOverrideReturn: boolean; canForceClose: boolean; canReopen: boolean;
  returns: OverrideReturnRow[]; dayCloses: OverrideDayRow[];
}

/** Items eligible for an override action, branch-scoped by RLS. Sections appear only
 *  for the permissions the caller holds. */
export async function loadOverrideQueue(): Promise<ActionResult<OverrideQueue>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  const has = (p: string) => ctx.permissions.includes(p as (typeof ctx.permissions)[number]) || ctx.isSuperAdmin;
  const canOverrideReturn = has('returns.override');
  const canForceClose = has('day.close.override');
  const canReopen = has('day.reopen');
  if (!canOverrideReturn && !canForceClose && !canReopen) return { ok: false, error: 'You do not have override permissions.' };
  const canViewCash = has('cash.view_outstanding') || has('day.close.settle');

  const supabase = await createClient();
  const out: OverrideQueue = { canOverrideReturn, canForceClose, canReopen, returns: [], dayCloses: [] };

  if (canOverrideReturn) {
    const { data } = await supabase
      .from('erp_sales_returns')
      .select('id, return_number, customer_id, total_amount, requested_by, requested_at, created_at, status, rejection_reason')
      .in('status', ['pending_approval', 'rejected']).order('requested_at', { ascending: false }).limit(100);
    const rows = (data ?? []) as { id: string; return_number: string; customer_id: string; total_amount: number; requested_by: string | null; requested_at: string | null; created_at: string | null; status: string; rejection_reason: string | null }[];
    const custIds = [...new Set(rows.map((r) => r.customer_id))];
    const reqIds = [...new Set(rows.map((r) => r.requested_by).filter((x): x is string => !!x))];
    const [{ data: cust }, { data: profs }] = await Promise.all([
      custIds.length ? supabase.from('erp_customers').select('id, name').in('id', custIds) : Promise.resolve({ data: [] }),
      reqIds.length ? supabase.from('erp_profiles').select('id, full_name').in('id', reqIds) : Promise.resolve({ data: [] }),
    ]);
    const cName = new Map(((cust ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const pName = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
    out.returns = rows.map((r) => ({
      id: r.id, document: r.return_number, customer: cName.get(r.customer_id) ?? r.customer_id.slice(0, 8),
      value: Number(r.total_amount ?? 0), requestedBy: pName.get(r.requested_by ?? '') || '—',
      requestedAt: r.requested_at ?? r.created_at, reason: r.rejection_reason, status: r.status,
    }));
  }

  if (canForceClose || canReopen) {
    const statuses = [
      ...(canForceClose ? ['pending_supervisor', 'pending_reconciliation', 'pending_settlement'] : []),
      ...(canReopen ? ['closed'] : []),
    ];
    if (statuses.length) {
      const { data } = await supabase
        .from('erp_day_close_requests')
        .select('id, work_session_id, salesman_id, status, submitted_at, expected_cash')
        .in('status', statuses).order('submitted_at', { ascending: false }).limit(100);
      const rows = (data ?? []) as { id: string; work_session_id: string; salesman_id: string; status: string; submitted_at: string | null; expected_cash: number | null }[];
      const sIds = [...new Set(rows.map((r) => r.salesman_id))];
      const wsIds = [...new Set(rows.map((r) => r.work_session_id))];
      const [{ data: profs }, { data: ws }] = await Promise.all([
        sIds.length ? supabase.from('erp_profiles').select('id, full_name').in('id', sIds) : Promise.resolve({ data: [] }),
        wsIds.length ? supabase.from('erp_work_sessions').select('id, work_date').in('id', wsIds) : Promise.resolve({ data: [] }),
      ]);
      const pName = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
      const wDate = new Map(((ws ?? []) as { id: string; work_date: string | null }[]).map((s) => [s.id, s.work_date]));
      out.dayCloses = rows.map((r) => ({
        id: r.id, document: wDate.get(r.work_session_id) ?? '—', salesman: pName.get(r.salesman_id) || r.salesman_id.slice(0, 8),
        value: canViewCash ? Number(r.expected_cash ?? 0) : null, requestedAt: r.submitted_at, status: r.status, closed: r.status === 'closed',
      }));
    }
  }

  return { ok: true, data: out };
}

// ── Override / Reopen history report ─────────────────────────────────────────

const OVERRIDE_ACTIONS = ['van_return.override_approve', 'van_return.override_reject', 'day_close.override', 'day_close.reopen'];

export interface OverrideHistoryRow { at: string; actor: string; action: string; entityId: string; reason: string | null }
export interface OverrideHistoryReport {
  range: { from: string; to: string };
  counts: { returnApprove: number; returnReject: number; dayClose: number; dayReopen: number };
  topUsers: { actor: string; count: number }[];
  reasons: { reason: string; count: number }[];
  history: OverrideHistoryRow[];
}

/** Override & reopen history from the audit log, with top users + reason breakdown. */
export async function loadOverrideHistory(range: { from: string; to: string }): Promise<ActionResult<OverrideHistoryReport>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'Not authenticated.' };
  const has = (p: string) => ctx.permissions.includes(p as (typeof ctx.permissions)[number]) || ctx.isSuperAdmin;
  if (!has('audit.view') && !has('returns.override') && !has('day.close.override') && !has('day.reopen') && !has('reports.view')) {
    return { ok: false, error: 'You do not have permission to view override history.' };
  }
  const supabase = await createClient();
  const { data, error: qErr } = await supabase
    .from('erp_audit_logs')
    .select('actor_id, actor_email, action, entity_id, details, created_at')
    .in('action', OVERRIDE_ACTIONS)
    .gte('created_at', `${range.from}T00:00:00`).lte('created_at', `${range.to}T23:59:59`)
    .order('created_at', { ascending: false }).limit(2000);
  if (qErr) return { ok: false, error: friendlyDbError(qErr) };
  const rows = (data ?? []) as { actor_id: string | null; actor_email: string | null; action: string; entity_id: string; details: { reason?: string } | null; created_at: string }[];

  const counts = { returnApprove: 0, returnReject: 0, dayClose: 0, dayReopen: 0 };
  const byUser = new Map<string, number>();
  const byReason = new Map<string, number>();
  const actorIds = new Set<string>();
  for (const r of rows) {
    if (r.action === 'van_return.override_approve') counts.returnApprove += 1;
    else if (r.action === 'van_return.override_reject') counts.returnReject += 1;
    else if (r.action === 'day_close.override') counts.dayClose += 1;
    else if (r.action === 'day_close.reopen') counts.dayReopen += 1;
    const key = r.actor_email || r.actor_id || 'unknown';
    byUser.set(key, (byUser.get(key) ?? 0) + 1);
    if (r.actor_id) actorIds.add(r.actor_id);
    const reason = (r.details?.reason ?? '').trim() || '—';
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  const nameById = new Map<string, string>();
  if (actorIds.size) {
    const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', [...actorIds]);
    for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) nameById.set(p.id, p.full_name ?? '');
  }
  const displayActor = (r: { actor_id: string | null; actor_email: string | null }) => (r.actor_id && nameById.get(r.actor_id)) || r.actor_email || '—';

  return {
    ok: true,
    data: {
      range, counts,
      topUsers: [...byUser.entries()].map(([actor, count]) => ({ actor, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      reasons: [...byReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 15),
      history: rows.slice(0, 200).map((r) => ({ at: r.created_at, actor: displayActor(r), action: r.action, entityId: r.entity_id, reason: (r.details?.reason ?? null) })),
    },
  };
}
