'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { summarizeSync } from '@/lib/erp/route-planner-sync';
import type { DataHealthInput } from '@/lib/erp/route-planner-data-health';
import type { RpEntity, RpSourceType, RpTicketType, RpTicketStatus, RpApprovalStep } from '@/lib/erp/route-planner-backend';
import type { RpNode } from '@/lib/erp/route-planner-reporting';
import { stageState, canApprove, statusForStage, flowHasSteps, type FlowEvent } from '@/lib/erp/route-planner-approval-engine';

function isAdminCtx(ctx: { isSuperAdmin: boolean; isPlatformOwner: boolean; topRole: string; isRoutePlannerAdmin: boolean }) {
  return ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.topRole === 'admin' || ctx.isRoutePlannerAdmin;
}

/** Load the company's reporting/role rows as engine nodes (edges + role only). */
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

/**
 * Route Planner backend — server actions over the persistence layer (migrations
 * 0354–0356). Company-scoped via RLS; writes additionally gated on the Route Planner
 * Admin / company admin in-app. These compile now and become live once the migrations
 * are applied to staging. Never touch official customer master data.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

// ── Integration: data sources + field mappings ──────────────────────────────
export async function listDataSources(): Promise<Result<unknown[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_data_sources').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? [] };
}

export async function createDataSource(input: { name: string; type: RpSourceType; config?: Record<string, unknown>; schedule?: string | null }): Promise<Result<{ id: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_data_sources')
    .insert({ company_id: ctx.companyId, name: input.name.trim(), type: input.type, config: input.config ?? {}, schedule: input.schedule ?? null, created_by: ctx.userId })
    .select('id').single();
  return error || !data ? { ok: false, error: error?.message ?? 'insert_failed' } : { ok: true, data: { id: data.id } };
}

export async function saveFieldMapping(sourceId: string, entity: RpEntity, mapping: Record<string, string>): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_field_mappings')
    .upsert({ source_id: sourceId, company_id: ctx.companyId, entity, mapping, updated_at: new Date().toISOString() }, { onConflict: 'source_id,entity' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getFieldMapping(sourceId: string, entity: RpEntity): Promise<Result<Record<string, string> | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_field_mappings')
    .select('mapping').eq('company_id', ctx.companyId).eq('source_id', sourceId).eq('entity', entity).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as { mapping?: Record<string, string> } | null)?.mapping ?? null };
}

// ── Integration: run a manual sync + history ────────────────────────────────
export async function runManualSync(input: {
  sourceId?: string | null; sourceLabel?: string | null;
  master: DataHealthInput; existingCodes?: string[]; rejected?: { row: number; reason: string }[];
}): Promise<Result<{ runId: string; imported: number; updated: number; rejected: number; issues: number }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const summary = summarizeSync(input.master, { existingKeys: new Set((input.existingCodes ?? []).map((c) => c.toLowerCase())), rejected: input.rejected });
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_sync_runs').insert({
    source_id: input.sourceId ?? null, company_id: ctx.companyId, trigger: 'manual', source_label: input.sourceLabel ?? null,
    finished_at: new Date().toISOString(), status: summary.status,
    rows_imported: summary.rowsImported, rows_updated: summary.rowsUpdated, rows_rejected: summary.rowsRejected,
    errors: summary.errors, quality: summary.quality,
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  if (input.sourceId) await sb.from('erp_rp_data_sources').update({ last_sync_at: new Date().toISOString(), last_status: summary.status }).eq('id', input.sourceId);
  return { ok: true, data: { runId: data.id, imported: summary.rowsImported, updated: summary.rowsUpdated, rejected: summary.rowsRejected, issues: summary.qualityIssues } };
}

export async function listSyncRuns(limit = 50): Promise<Result<unknown[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_sync_runs').select('*').eq('company_id', ctx.companyId).order('started_at', { ascending: false }).limit(limit);
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? [] };
}

// ── Request Center ──────────────────────────────────────────────────────────
export async function createRequest(input: {
  type: RpTicketType; customerRef?: string | null; changes?: Record<string, { old?: string; new?: string }>;
  details?: Record<string, unknown>; reason?: string; gpsLat?: number | null; gpsLng?: number | null;
}): Promise<Result<{ id: string; ticketNo: string | null }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: tn } = await sb.rpc('rp_next_ticket_no', { p_company: ctx.companyId });

  // If an active approval flow exists for this type, initialise the workflow state so
  // the ticket opens at its first pending stage (instead of a bare "created").
  const { data: flowRow } = await sb.from('erp_rp_approval_flows')
    .select('steps, is_active').eq('company_id', ctx.companyId).eq('ticket_type', input.type).maybeSingle();
  const steps = (flowRow && flowRow.is_active !== false) ? ((flowRow.steps as RpApprovalStep[]) ?? []) : [];
  const createEvent: FlowEvent = { kind: 'create', by: ctx.userId, at: new Date().toISOString() };
  let status: RpTicketStatus = 'created';
  let currentStage: string | null = null;
  if (flowHasSteps(steps)) {
    const nodes = await loadNodes(sb, ctx.companyId!);
    const st = stageState(steps, { requesterId: ctx.userId, nodes }, [createEvent]);
    status = statusForStage(st);
    currentStage = st.pending ? String(st.pending.index) : 'done';
  }

  const { data, error } = await sb.from('erp_route_planner_requests').insert({
    company_id: ctx.companyId, ticket_no: (tn as string | null) ?? null, type: input.type,
    requested_by: ctx.userId, requested_role: ctx.topRole, customer_ref: input.customerRef ?? null,
    changes: input.details ?? input.changes ?? {}, reason: input.reason ?? null, gps_lat: input.gpsLat ?? null, gps_lng: input.gpsLng ?? null,
    status, current_stage: currentStage, events: [createEvent],
  }).select('id, ticket_no').single();
  return error || !data ? { ok: false, error: error?.message ?? 'insert_failed' } : { ok: true, data: { id: data.id, ticketNo: data.ticket_no } };
}

export interface RequestApprovalView {
  hasFlow: boolean;
  done: boolean;
  status: string;
  pending: null | {
    stage: string; index: number; mode: 'all' | 'any';
    assignees: { id: string; name: string }[]; approvedBy: string[]; canAct: boolean;
  };
}

/** The live approval state for a ticket — drives the Request Center workflow panel. */
export async function getRequestApproval(requestId: string): Promise<Result<RequestApprovalView>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: req, error } = await sb.from('erp_route_planner_requests')
    .select('type, requested_by, status, events').eq('id', requestId).maybeSingle();
  if (error || !req) return { ok: false, error: error?.message ?? 'not_found' };
  const { data: flowRow } = await sb.from('erp_rp_approval_flows')
    .select('steps, is_active').eq('company_id', ctx.companyId).eq('ticket_type', req.type as RpTicketType).maybeSingle();
  const steps = (flowRow && flowRow.is_active !== false) ? ((flowRow.steps as RpApprovalStep[]) ?? []) : [];
  if (!flowHasSteps(steps)) return { ok: true, data: { hasFlow: false, done: false, status: String(req.status), pending: null } };

  const nodes = await loadNodes(sb, ctx.companyId!);
  const events = ((req.events as FlowEvent[]) ?? []);
  const st = stageState(steps, { requesterId: String(req.requested_by), nodes }, events);
  let pending: RequestApprovalView['pending'] = null;
  if (st.pending) {
    const ids = st.pending.assignees;
    const { data: profs } = ids.length ? await sb.from('erp_profiles').select('id, full_name, email').in('id', ids) : { data: [] };
    const nameById = new Map((profs ?? []).map((p) => [p.id as string, (p.full_name as string | null) || (p.email as string | null) || String(p.id).slice(0, 8)]));
    pending = {
      stage: st.pending.step.stage, index: st.pending.index, mode: st.pending.step.mode ?? 'all',
      assignees: ids.map((id) => ({ id, name: nameById.get(id) ?? id.slice(0, 8) })),
      approvedBy: st.pending.approvedBy,
      canAct: canApprove(st.pending.assignees, ctx.userId, String(req.requested_by), isAdminCtx(ctx)),
    };
  }
  return { ok: true, data: { hasFlow: true, done: st.done, status: String(req.status), pending } };
}

/** Advance a ticket through its approval flow. Enforces stage authority + no
 *  self-approval. action: approve | reject | need_info. */
export async function advanceRequest(requestId: string, action: 'approve' | 'reject' | 'need_info', note?: string): Promise<Result<{ status: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: req, error } = await sb.from('erp_route_planner_requests')
    .select('type, requested_by, events').eq('id', requestId).maybeSingle();
  if (error || !req) return { ok: false, error: error?.message ?? 'not_found' };

  const { data: flowRow } = await sb.from('erp_rp_approval_flows')
    .select('steps, is_active').eq('company_id', ctx.companyId).eq('ticket_type', req.type as RpTicketType).maybeSingle();
  const steps = (flowRow && flowRow.is_active !== false) ? ((flowRow.steps as RpApprovalStep[]) ?? []) : [];
  if (!flowHasSteps(steps)) return { ok: false, error: 'err_no_flow' };

  const nodes = await loadNodes(sb, ctx.companyId!);
  const requesterId = String(req.requested_by);
  const events = ((req.events as FlowEvent[]) ?? []);
  const st = stageState(steps, { requesterId, nodes }, events);
  if (!st.pending) return { ok: false, error: 'err_already_done' };
  if (!canApprove(st.pending.assignees, ctx.userId, requesterId, isAdminCtx(ctx))) return { ok: false, error: 'err_not_authorized' };

  const at = new Date().toISOString();
  const stepIdx = st.pending.index;
  let newStatus: RpTicketStatus;
  let newStage: string | null;
  const next = [...events];

  if (action === 'reject') {
    next.push({ kind: 'reject', step: stepIdx, by: ctx.userId, at, note: note ?? null });
    newStatus = 'rejected'; newStage = 'done';
  } else if (action === 'need_info') {
    next.push({ kind: 'info', step: stepIdx, by: ctx.userId, at, note: note ?? null });
    newStatus = 'need_more_info'; newStage = String(stepIdx);
  } else {
    next.push({ kind: 'approve', step: stepIdx, by: ctx.userId, at, note: note ?? null });
    const after = stageState(steps, { requesterId, nodes }, next);
    newStatus = statusForStage(after); newStage = after.pending ? String(after.pending.index) : 'done';
  }

  const { error: uErr } = await sb.from('erp_route_planner_requests')
    .update({ status: newStatus, current_stage: newStage, events: next, updated_at: at }).eq('id', requestId);
  return uErr ? { ok: false, error: uErr.message } : { ok: true, data: { status: newStatus } };
}

export async function listRequests(): Promise<Result<unknown[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_route_planner_requests').select('*').eq('company_id', ctx.companyId).order('created_at', { ascending: false });
  return error ? { ok: false, error: error.message } : { ok: true, data: data ?? [] };
}

export async function transitionRequest(id: string, status: RpTicketStatus, note?: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: cur } = await sb.from('erp_route_planner_requests').select('events').eq('id', id).maybeSingle();
  const events = Array.isArray((cur as { events?: unknown[] } | null)?.events) ? (cur as { events: unknown[] }).events : [];
  events.push({ at: new Date().toISOString(), by: ctx.userId, status, note: note ?? null });
  const { error } = await sb.from('erp_route_planner_requests').update({ status, events, updated_at: new Date().toISOString() }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Approval Builder ─────────────────────────────────────────────────────────
export interface RpApprovalFlowRow { ticketType: RpTicketType; steps: RpApprovalStep[]; isActive: boolean }

export async function getApprovalFlow(ticketType: RpTicketType): Promise<Result<RpApprovalStep[] | null>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data } = await sb.from('erp_rp_approval_flows').select('steps').eq('company_id', ctx.companyId).eq('ticket_type', ticketType).maybeSingle();
  return { ok: true, data: (data as { steps?: RpApprovalStep[] } | null)?.steps ?? null };
}

/** All configured approval flows for the company (for the Approval Builder overview). */
export async function listApprovalFlows(): Promise<Result<RpApprovalFlowRow[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_approval_flows').select('ticket_type, steps, is_active').eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []).map((r) => ({
    ticketType: r.ticket_type as RpTicketType,
    steps: (r.steps as RpApprovalStep[]) ?? [],
    isActive: r.is_active !== false,
  }));
  return { ok: true, data: rows };
}

export async function saveApprovalFlow(ticketType: RpTicketType, steps: RpApprovalStep[], isActive = true): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_approval_flows')
    .upsert({ company_id: ctx.companyId, ticket_type: ticketType, steps, is_active: isActive, updated_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: 'company_id,ticket_type' });
  return error ? { ok: false, error: error.message } : { ok: true };
}
