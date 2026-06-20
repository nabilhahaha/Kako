'use server';

// ============================================================================
// Wave C — server persistence for saved planning outputs:
//   * erp_rp_day_plans      — built visit sequences (Day Planner)
//   * erp_rp_journey_plans  — frequency-driven multi-week schedules (Journey Planner)
//
// Reopen across devices; save / edit / duplicate / archive; manager-created plans that a
// supervisor owns (assigned_to); generate a Daily Visit Plan FROM a Journey Plan. Company-
// scoped + RLS (migration 0361). Visible to creator + assignee + reporting subtree + admin.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { dailyVisitPlanFromJourney, type JourneyDayKey, type StoredAssignment } from '@/lib/erp/route-planner-daily-plan';
import { stageState, canApprove, flowHasSteps, type FlowEvent } from '@/lib/erp/route-planner-approval-engine';
import type { RpApprovalStep, RpPlanApprovalType } from '@/lib/erp/route-planner-backend';
import type { RpNode } from '@/lib/erp/route-planner-reporting';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

function isAdminCtx(ctx: { isSuperAdmin: boolean; isPlatformOwner: boolean; topRole: string; isRoutePlannerAdmin: boolean; routePlannerAccess?: { role?: string | null } | null }) {
  return ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.topRole === 'admin' || ctx.isRoutePlannerAdmin
    || ctx.routePlannerAccess?.role === 'route_planner_admin';
}

// ── Plan approval (Wave K) — reuse the shared Approval Builder + engine ───────
export type PlanKind = 'journey' | 'daily';
const PLAN_TABLE: Record<PlanKind, string> = { journey: 'erp_rp_journey_plans', daily: 'erp_rp_day_plans' };
const PLAN_FLOW_KEY: Record<PlanKind, RpPlanApprovalType> = { journey: 'journey_plan', daily: 'daily_plan' };

async function loadNodes(sb: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<RpNode[]> {
  const { data } = await sb.from('erp_route_planner_access')
    .select('user_id, role, primary_manager_id, secondary_manager_id, see_all').eq('company_id', companyId);
  return (data ?? []).map((r) => ({
    userId: r.user_id as string, name: '', email: null, role: (r.role as string | null) ?? null,
    primaryManagerId: (r.primary_manager_id as string | null) ?? null,
    secondaryManagerId: (r.secondary_manager_id as string | null) ?? null,
    seeAll: Boolean(r.see_all), inGraph: true,
  }));
}

async function loadFlowSteps(sb: Awaited<ReturnType<typeof createClient>>, companyId: string, key: RpPlanApprovalType): Promise<RpApprovalStep[]> {
  const { data } = await sb.from('erp_rp_approval_flows').select('steps, is_active').eq('company_id', companyId).eq('ticket_type', key).maybeSingle();
  return (data && data.is_active !== false) ? ((data.steps as RpApprovalStep[]) ?? []) : [];
}

export interface PlanApprovalView {
  hasFlow: boolean; done: boolean; status: string;
  pending: null | { stage: string; index: number; mode: 'all' | 'any'; assignees: { id: string; name: string }[]; approvedBy: string[]; canAct: boolean };
}

/** Submit a plan for approval — initialises the workflow at its first pending stage. */
export async function submitPlanForApproval(kind: PlanKind, id: string): Promise<Result<{ status: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const steps = await loadFlowSteps(sb, ctx.companyId!, PLAN_FLOW_KEY[kind]);
  if (!flowHasSteps(steps)) return { ok: false, error: 'err_no_flow' };
  const { data: plan } = await sb.from(PLAN_TABLE[kind]).select('owner_id').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  if (!plan) return { ok: false, error: 'not_found' };
  const createEvent: FlowEvent = { kind: 'create', by: ctx.userId, at: new Date().toISOString() };
  const nodes = await loadNodes(sb, ctx.companyId!);
  const st = stageState(steps, { requesterId: String(plan.owner_id), nodes }, [createEvent]);
  const status = st.done ? 'approved' : 'pending';
  const { error } = await sb.from(PLAN_TABLE[kind])
    .update({ approval_status: status, approval_stage: st.pending ? String(st.pending.index) : 'done', approval_events: [createEvent], updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true, data: { status } };
}

export async function getPlanApproval(kind: PlanKind, id: string): Promise<Result<PlanApprovalView>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: plan } = await sb.from(PLAN_TABLE[kind]).select('owner_id, approval_status, approval_events').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  if (!plan) return { ok: false, error: 'not_found' };
  const steps = await loadFlowSteps(sb, ctx.companyId!, PLAN_FLOW_KEY[kind]);
  if (!flowHasSteps(steps)) return { ok: true, data: { hasFlow: false, done: false, status: String(plan.approval_status ?? 'none'), pending: null } };
  const nodes = await loadNodes(sb, ctx.companyId!);
  const events = ((plan.approval_events as FlowEvent[]) ?? []);
  const st = stageState(steps, { requesterId: String(plan.owner_id), nodes }, events);
  let pending: PlanApprovalView['pending'] = null;
  if (st.pending) {
    const ids = st.pending.assignees;
    const { data: profs } = ids.length ? await sb.from('erp_profiles').select('id, full_name, email').in('id', ids) : { data: [] };
    const nameById = new Map((profs ?? []).map((p) => [p.id as string, (p.full_name as string | null) || (p.email as string | null) || String(p.id).slice(0, 8)]));
    pending = {
      stage: st.pending.step.stage, index: st.pending.index, mode: st.pending.step.mode ?? 'all',
      assignees: ids.map((pid) => ({ id: pid, name: nameById.get(pid) ?? pid.slice(0, 8) })),
      approvedBy: st.pending.approvedBy,
      canAct: canApprove(st.pending.assignees, ctx.userId, String(plan.owner_id), isAdminCtx(ctx)),
    };
  }
  return { ok: true, data: { hasFlow: true, done: st.done, status: String(plan.approval_status ?? 'none'), pending } };
}

export async function advancePlanApproval(kind: PlanKind, id: string, action: 'approve' | 'reject', note?: string): Promise<Result<{ status: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: plan } = await sb.from(PLAN_TABLE[kind]).select('owner_id, approval_events').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  if (!plan) return { ok: false, error: 'not_found' };
  const steps = await loadFlowSteps(sb, ctx.companyId!, PLAN_FLOW_KEY[kind]);
  if (!flowHasSteps(steps)) return { ok: false, error: 'err_no_flow' };
  const nodes = await loadNodes(sb, ctx.companyId!);
  const requesterId = String(plan.owner_id);
  const events = ((plan.approval_events as FlowEvent[]) ?? []);
  const st = stageState(steps, { requesterId, nodes }, events);
  if (!st.pending) return { ok: false, error: 'err_already_done' };
  if (!canApprove(st.pending.assignees, ctx.userId, requesterId, isAdminCtx(ctx))) return { ok: false, error: 'err_not_authorized' };

  const at = new Date().toISOString();
  const next = [...events];
  let status: string; let stage: string;
  if (action === 'reject') {
    next.push({ kind: 'reject', step: st.pending.index, by: ctx.userId, at, note: note ?? null });
    status = 'rejected'; stage = 'done';
  } else {
    next.push({ kind: 'approve', step: st.pending.index, by: ctx.userId, at, note: note ?? null });
    const after = stageState(steps, { requesterId, nodes }, next);
    status = after.done ? 'approved' : 'pending'; stage = after.pending ? String(after.pending.index) : 'done';
  }
  const { error } = await sb.from(PLAN_TABLE[kind]).update({ approval_status: status, approval_stage: stage, approval_events: next, updated_at: at }).eq('id', id).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true, data: { status } };
}

/** Plans where the caller is the current pending approver (both kinds) — a plan-approvals inbox. */
export async function listMyPlanApprovals(): Promise<Result<{ kind: PlanKind; id: string; name: string }[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const nodes = await loadNodes(sb, ctx.companyId!);
  const out: { kind: PlanKind; id: string; name: string }[] = [];
  for (const kind of ['journey', 'daily'] as PlanKind[]) {
    const steps = await loadFlowSteps(sb, ctx.companyId!, PLAN_FLOW_KEY[kind]);
    if (!flowHasSteps(steps)) continue;
    const { data: plans } = await sb.from(PLAN_TABLE[kind]).select('id, name, owner_id, approval_status, approval_events').eq('company_id', ctx.companyId).eq('approval_status', 'pending');
    for (const p of plans ?? []) {
      if (String(p.owner_id) === ctx.userId) continue; // no self-approval
      const st = stageState(steps, { requesterId: String(p.owner_id), nodes }, (p.approval_events as FlowEvent[]) ?? []);
      if (st.pending && st.pending.assignees.includes(ctx.userId)) out.push({ kind, id: String(p.id), name: String(p.name) });
    }
  }
  return { ok: true, data: out };
}

export interface SavedPlanRow {
  id: string; name: string; status: 'active' | 'archived';
  assignedTo: string | null; datasetId: string | null;
  plan: Record<string, unknown>; frequencies?: Record<string, string>;
  sourceJourneyId?: string | null; createdAt: number; updatedAt: number;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
}

function rowToPlan(r: Record<string, unknown>): SavedPlanRow {
  return {
    id: r.id as string, name: (r.name as string) ?? '', status: (r.status as 'active' | 'archived') ?? 'active',
    assignedTo: (r.assigned_to as string | null) ?? null, datasetId: (r.dataset_id as string | null) ?? null,
    plan: (r.plan as Record<string, unknown>) ?? {}, frequencies: (r.frequencies as Record<string, string>) ?? undefined,
    sourceJourneyId: (r.source_journey_id as string | null) ?? null,
    createdAt: new Date(r.created_at as string).getTime(), updatedAt: new Date((r.updated_at as string) ?? (r.created_at as string)).getTime(),
    approvalStatus: (r.approval_status as 'none' | 'pending' | 'approved' | 'rejected') ?? 'none',
  };
}

// ── Day Plans ───────────────────────────────────────────────────────────────
export async function listDayPlans(includeArchived = false): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  let q = sb.from('erp_rp_day_plans').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  if (!includeArchived) q = q.eq('status', 'active');
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(rowToPlan) };
}

/** Save (or replace by exact name, per owner) a day plan. Returns the new active list. */
export async function saveDayPlan(name: string, plan: Record<string, unknown>, opts?: { assignedTo?: string | null; datasetId?: string | null }): Promise<Result<{ id: string; plans: SavedPlanRow[] }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim(); if (!clean) return { ok: false, error: 'err_name_required' };
  const sb = await createClient();
  await sb.from('erp_rp_day_plans').delete().eq('company_id', ctx.companyId).eq('owner_id', ctx.userId).eq('status', 'active').ilike('name', clean);
  const { data, error } = await sb.from('erp_rp_day_plans').insert({
    company_id: ctx.companyId, owner_id: ctx.userId, assigned_to: opts?.assignedTo ?? null, dataset_id: opts?.datasetId ?? null,
    name: clean, plan, updated_at: new Date().toISOString(),
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  const list = await listDayPlans();
  return { ok: true, data: { id: data.id as string, plans: list.ok ? list.data! : [] } };
}

export async function getDayPlan(id: string): Promise<Result<SavedPlanRow | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_day_plans').select('*').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ? rowToPlan(data) : null };
}

export async function deleteDayPlan(id: string): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_day_plans').delete().eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const list = await listDayPlans(); return { ok: true, data: list.ok ? list.data! : [] };
}

export async function duplicateDayPlan(id: string): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const cur = await getDayPlan(id); if (!cur.ok || !cur.data) return { ok: false, error: 'not_found' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_day_plans').insert({
    company_id: ctx.companyId, owner_id: ctx.userId, assigned_to: cur.data.assignedTo, dataset_id: cur.data.datasetId,
    name: `${cur.data.name} (copy)`.slice(0, 120), plan: cur.data.plan,
  });
  if (error) return { ok: false, error: error.message };
  const list = await listDayPlans(); return { ok: true, data: list.ok ? list.data! : [] };
}

export async function archiveDayPlan(id: string, archived = true): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_day_plans').update({ status: archived ? 'archived' : 'active', updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const list = await listDayPlans(); return { ok: true, data: list.ok ? list.data! : [] };
}

/** One-time migration of localStorage day plans (idempotent by name, per owner). */
export async function migrateLocalDayPlans(items: { name: string; plan: Record<string, unknown> }[]): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!items?.length) return listDayPlans();
  const sb = await createClient();
  const { data: existing } = await sb.from('erp_rp_day_plans').select('name').eq('company_id', ctx.companyId).eq('owner_id', ctx.userId);
  const have = new Set((existing ?? []).map((r) => String(r.name).toLowerCase()));
  const rows = items.filter((it) => it.name?.trim() && !have.has(it.name.trim().toLowerCase()))
    .map((it) => ({ company_id: ctx.companyId, owner_id: ctx.userId, name: it.name.trim(), plan: it.plan ?? {} }));
  if (rows.length) { const { error } = await sb.from('erp_rp_day_plans').insert(rows); if (error) return { ok: false, error: error.message }; }
  return listDayPlans();
}

// ── Journey Plans ─────────────────────────────────────────────────────────────
export async function listJourneyPlans(includeArchived = false): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  let q = sb.from('erp_rp_journey_plans').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  if (!includeArchived) q = q.eq('status', 'active');
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(rowToPlan) };
}

export async function saveJourneyPlan(
  name: string, frequencies: Record<string, string>, plan: Record<string, unknown>,
  opts?: { assignedTo?: string | null; datasetId?: string | null },
): Promise<Result<{ id: string; plans: SavedPlanRow[] }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim(); if (!clean) return { ok: false, error: 'err_name_required' };
  const sb = await createClient();
  await sb.from('erp_rp_journey_plans').delete().eq('company_id', ctx.companyId).eq('owner_id', ctx.userId).eq('status', 'active').ilike('name', clean);
  const { data, error } = await sb.from('erp_rp_journey_plans').insert({
    company_id: ctx.companyId, owner_id: ctx.userId, assigned_to: opts?.assignedTo ?? null, dataset_id: opts?.datasetId ?? null,
    name: clean, frequencies, plan, updated_at: new Date().toISOString(),
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  const list = await listJourneyPlans();
  return { ok: true, data: { id: data.id as string, plans: list.ok ? list.data! : [] } };
}

export async function getJourneyPlan(id: string): Promise<Result<SavedPlanRow | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_journey_plans').select('*').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ? rowToPlan(data) : null };
}

export async function deleteJourneyPlan(id: string): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_journey_plans').delete().eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const list = await listJourneyPlans(); return { ok: true, data: list.ok ? list.data! : [] };
}

export async function archiveJourneyPlan(id: string, archived = true): Promise<Result<SavedPlanRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_journey_plans').update({ status: archived ? 'archived' : 'active', updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const list = await listJourneyPlans(); return { ok: true, data: list.ok ? list.data! : [] };
}

/**
 * Generate a Daily Visit Plan from a saved Journey Plan: pick every customer scheduled on
 * `day`, persist them as a new Day Plan (linked via source_journey_id). The journey's
 * stored `plan.customers` provides the ordered customer list + `plan.assignments` the
 * day mapping. Returns the new day-plan id.
 */
export async function generateDailyPlanFromJourney(journeyId: string, day: JourneyDayKey, name?: string): Promise<Result<{ id: string; count: number }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const jp = await getJourneyPlan(journeyId);
  if (!jp.ok || !jp.data) return { ok: false, error: 'not_found' };
  const planObj = jp.data.plan as { assignments?: Record<string, StoredAssignment>; customers?: { id: string }[] };
  const customers = planObj.customers ?? [];
  const stops = dailyVisitPlanFromJourney(planObj.assignments ?? {}, customers, day);
  const subset = stops.map((s) => s.customer);
  const order = subset.map((c) => c.id);

  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_day_plans').insert({
    company_id: ctx.companyId, owner_id: ctx.userId, assigned_to: jp.data.assignedTo, dataset_id: jp.data.datasetId,
    source_journey_id: journeyId, name: (name?.trim() || `${jp.data.name} — ${day}`).slice(0, 120),
    plan: { customers: subset, order, start: null, end: null, hasSales: false, day },
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, data: { id: data.id as string, count: subset.length } };
}
