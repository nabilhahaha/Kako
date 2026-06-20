'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { summarizeSync } from '@/lib/erp/route-planner-sync';
import { fetchConnector, redactConfig, type ConnectorType, type ConnectorConfig } from '@/lib/erp/route-planner-connectors';
import { toCustomers, isValidCustomer, type CmMapping } from '@/lib/erp/route-planner-customer-map';
import { suggestColumnMapping } from '@/lib/tis/upload';
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
  if (error) return { ok: false, error: error.message };
  // SECURITY: never return secrets (e.g. API tokens) to the client — redact config.
  const rows = (data ?? []).map((r) => ({ ...r, config: redactConfig(r.config as Record<string, unknown> | null) }));
  return { ok: true, data: rows };
}

export async function createDataSource(input: { name: string; type: RpSourceType; config?: Record<string, unknown>; schedule?: string | null }): Promise<Result<{ id: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!isAdminCtx(ctx)) return { ok: false, error: 'err_unauthorized' }; // connectors are admin-managed
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_data_sources')
    .insert({ company_id: ctx.companyId, name: input.name.trim(), type: input.type, config: input.config ?? {}, schedule: input.schedule ?? null, created_by: ctx.userId })
    .select('id').single();
  return error || !data ? { ok: false, error: error?.message ?? 'insert_failed' } : { ok: true, data: { id: data.id } };
}

/** Update a source's config. A blank token is NOT written — the stored token is kept
 *  (write-only secret). Admin-only. */
export async function updateDataSource(sourceId: string, input: { name?: string; config?: Record<string, unknown> }): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!isAdminCtx(ctx)) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name) patch.name = input.name.trim();
  if (input.config) {
    const { data: cur } = await sb.from('erp_rp_data_sources').select('config').eq('id', sourceId).eq('company_id', ctx.companyId).maybeSingle();
    const existing = (cur?.config as Record<string, unknown> | null) ?? {};
    const next = { ...existing, ...input.config };
    if (!('token' in input.config) || !input.config.token) next.token = existing.token; // keep stored token
    patch.config = next;
  }
  const { error } = await sb.from('erp_rp_data_sources').update(patch).eq('id', sourceId).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Delete a data source (and its mappings/runs via FK). Admin-only. */
export async function deleteDataSource(sourceId: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!isAdminCtx(ctx)) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_data_sources').delete().eq('id', sourceId).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
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

// ── Integration: the SHARED post-fetch pipeline ─────────────────────────────
// Validate → Data Health → Sync History → Audit. Used identically by Manual Upload
// AND every connector — there is no source-specific customer logic past this point.
type SyncResult = Result<{ runId: string; imported: number; updated: number; rejected: number; issues: number; quality: Record<string, number> }>;

async function recordSync(
  sb: Awaited<ReturnType<typeof createClient>>, companyId: string,
  input: { sourceId?: string | null; sourceLabel?: string | null; trigger?: 'manual' | 'scheduled';
           master: DataHealthInput; existingCodes?: string[]; rejected?: { row: number; reason: string }[] },
): Promise<SyncResult> {
  const summary = summarizeSync(input.master, { existingKeys: new Set((input.existingCodes ?? []).map((c) => c.toLowerCase())), rejected: input.rejected });
  const { data, error } = await sb.from('erp_rp_sync_runs').insert({
    source_id: input.sourceId ?? null, company_id: companyId, trigger: input.trigger ?? 'manual', source_label: input.sourceLabel ?? null,
    finished_at: new Date().toISOString(), status: summary.status,
    rows_imported: summary.rowsImported, rows_updated: summary.rowsUpdated, rows_rejected: summary.rowsRejected,
    errors: summary.errors, quality: summary.quality,
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  if (input.sourceId) await sb.from('erp_rp_data_sources').update({ last_sync_at: new Date().toISOString(), last_status: summary.status }).eq('id', input.sourceId);
  return { ok: true, data: { runId: data.id, imported: summary.rowsImported, updated: summary.rowsUpdated, rejected: summary.rowsRejected, issues: summary.qualityIssues, quality: (summary.quality as Record<string, number>) ?? {} } };
}

/** Manual Upload sync — client has already parsed + mapped to HCustomer; runs the shared pipeline. */
export async function runManualSync(input: {
  sourceId?: string | null; sourceLabel?: string | null;
  master: DataHealthInput; existingCodes?: string[]; rejected?: { row: number; reason: string }[];
}): Promise<SyncResult> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  return recordSync(sb, ctx.companyId!, { ...input, trigger: 'manual' });
}

// ── Connectors: Fetch (server) → then the SAME shared pipeline ───────────────
const CONNECTOR_ENTITY: RpEntity = 'customer_master';

async function loadConnectorSource(sb: Awaited<ReturnType<typeof createClient>>, companyId: string, sourceId: string) {
  const { data } = await sb.from('erp_rp_data_sources').select('id, name, type, config').eq('id', sourceId).eq('company_id', companyId).maybeSingle();
  return data as { id: string; name: string; type: string; config: ConnectorConfig } | null;
}

/** Fetch the source's columns + a sample + a suggested mapping (the connector "preview"
 *  before mapping). Admin-only; the token is used server-side only and never returned. */
export async function fetchConnectorColumns(sourceId: string): Promise<Result<{ headers: string[]; records: Record<string, string>[]; suggested: Record<string, string | undefined> }>> {
  const ctx = await ctxOrNull(); if (!ctx || !isAdminCtx(ctx)) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const src = await loadConnectorSource(sb, ctx.companyId!, sourceId);
  if (!src || (src.type !== 'google_sheets' && src.type !== 'api_erp')) return { ok: false, error: 'err_not_connector' };
  try {
    const sheet = await fetchConnector(src.type as ConnectorType, src.config);
    if (sheet.headers.length === 0) return { ok: false, error: 'err_no_rows' };
    return { ok: true, data: { headers: sheet.headers, records: sheet.rows.slice(0, 50), suggested: suggestColumnMapping(sheet.headers) as Record<string, string | undefined> } };
  } catch (e) {
    return { ok: false, error: `fetch_${e instanceof Error ? e.message : 'failed'}` }; // codes only — no token/url echo
  }
}

/** Run a full connector sync: Fetch → shared Map/Validate/Data-Health/History/Audit.
 *  Persists the mapping for reuse. Admin-only. */
export async function runConnectorSync(sourceId: string, mapping: CmMapping): Promise<SyncResult> {
  const ctx = await ctxOrNull(); if (!ctx || !isAdminCtx(ctx)) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const src = await loadConnectorSource(sb, ctx.companyId!, sourceId);
  if (!src || (src.type !== 'google_sheets' && src.type !== 'api_erp')) return { ok: false, error: 'err_not_connector' };

  let rows: Record<string, string>[];
  try { rows = (await fetchConnector(src.type as ConnectorType, src.config)).rows; }
  catch (e) { return { ok: false, error: `fetch_${e instanceof Error ? e.message : 'failed'}` }; }

  // SHARED map step (identical to Manual Upload) — no connector-specific customer logic.
  const customers = toCustomers(rows, mapping);
  const valid = customers.filter(isValidCustomer);
  const rejected = customers.map((c, i) => ({ c, i })).filter(({ c }) => !isValidCustomer(c)).map(({ i }) => ({ row: i + 1, reason: 'missing_required' }));

  // Persist the mapping for reuse, then run the shared pipeline.
  const clean: Record<string, string> = {}; for (const k of Object.keys(mapping)) { const v = mapping[k]; if (v) clean[k] = v; }
  await sb.from('erp_rp_field_mappings').upsert({ source_id: sourceId, company_id: ctx.companyId, entity: CONNECTOR_ENTITY, mapping: clean, updated_at: new Date().toISOString() }, { onConflict: 'source_id,entity' });

  return recordSync(sb, ctx.companyId!, { sourceId, sourceLabel: src.name, trigger: 'manual', master: { customers: valid }, existingCodes: [], rejected });
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

/**
 * Ticket ids where the caller is the PENDING approver right now — the "My Approvals"
 * queue. A ticket qualifies when its active flow's current step resolves to the caller
 * (direct assignment) and the caller is not the requester (no self-approval).
 */
export async function listMyApprovals(): Promise<Result<{ ids: string[] }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const [{ data: reqs }, { data: flowRows }] = await Promise.all([
    sb.from('erp_route_planner_requests').select('id, type, requested_by, events, status').eq('company_id', ctx.companyId),
    sb.from('erp_rp_approval_flows').select('ticket_type, steps, is_active').eq('company_id', ctx.companyId),
  ]);
  const flows = new Map<string, RpApprovalStep[]>();
  for (const f of flowRows ?? []) if (f.is_active !== false) flows.set(f.ticket_type as string, (f.steps as RpApprovalStep[]) ?? []);
  if ((reqs ?? []).length === 0 || flows.size === 0) return { ok: true, data: { ids: [] } };

  const nodes = await loadNodes(sb, ctx.companyId!);
  const terminal = new Set(['closed', 'rejected', 'cancelled', 'implemented_externally']);
  const ids: string[] = [];
  for (const r of reqs ?? []) {
    if (terminal.has(String(r.status))) continue;
    const steps = flows.get(String(r.type)); if (!steps || !flowHasSteps(steps)) continue;
    const requesterId = String(r.requested_by);
    if (requesterId === ctx.userId) continue; // never my own ticket
    const st = stageState(steps, { requesterId, nodes }, (r.events as FlowEvent[]) ?? []);
    if (st.pending && st.pending.assignees.includes(ctx.userId)) ids.push(String(r.id));
  }
  return { ok: true, data: { ids } };
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
