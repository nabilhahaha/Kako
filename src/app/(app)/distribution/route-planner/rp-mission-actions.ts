'use server';

// ============================================================================
// Supervisor Missions — server actions (Wave E/F). Company-scoped + RLS (migration
// 0363). Capability is enforced here via mission_perms (0362): create / assign / review;
// execute is implicit for the assigned supervisor. Visibility uses the Reporting Graph.
// Photos reuse the shared erp_attachments (referenced by id in event payloads).
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { missionPermsOf } from '@/lib/erp/route-planner-access';
import { canTransition, transitionCapability, missionReport, type MissionStatus, type StopObservationKind } from '@/lib/erp/route-planner-mission';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
function perms(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>) {
  return missionPermsOf(ctx.routePlannerAccess ?? null);
}

export interface MissionStopInput {
  customerCode?: string | null; customerName: string; lat?: number | null; lng?: number | null; seq?: number;
}

export interface MissionHeader {
  id: string; name: string; status: MissionStatus; missionDate: string | null;
  createdBy: string; assignedTo: string | null; datasetId: string | null;
  stopCount: number; startedAt: number | null; completedAt: number | null;
  createdAt: number; updatedAt: number;
}

function toHeader(r: Record<string, unknown>): MissionHeader {
  return {
    id: r.id as string, name: (r.name as string) ?? '', status: (r.status as MissionStatus) ?? 'draft',
    missionDate: (r.mission_date as string | null) ?? null, createdBy: r.created_by as string,
    assignedTo: (r.assigned_to as string | null) ?? null, datasetId: (r.dataset_id as string | null) ?? null,
    stopCount: (r.stop_count as number) ?? 0,
    startedAt: r.started_at ? new Date(r.started_at as string).getTime() : null,
    completedAt: r.completed_at ? new Date(r.completed_at as string).getTime() : null,
    createdAt: new Date(r.created_at as string).getTime(),
    updatedAt: new Date((r.updated_at as string) ?? (r.created_at as string)).getTime(),
  };
}

// ── Create / build ──────────────────────────────────────────────────────────
export async function createMission(input: {
  name: string; missionDate?: string | null; assignedTo?: string | null; datasetId?: string | null;
  stops?: MissionStopInput[]; meta?: Record<string, unknown>;
}): Promise<Result<{ id: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!perms(ctx).canCreate) return { ok: false, error: 'err_no_create_perm' };
  const name = input.name?.trim(); if (!name) return { ok: false, error: 'err_name_required' };
  const sb = await createClient();
  // Assigning at create time requires the assign capability.
  if (input.assignedTo && !perms(ctx).canAssign) return { ok: false, error: 'err_no_assign_perm' };
  const status: MissionStatus = input.assignedTo ? 'assigned' : 'draft';
  const stops = (input.stops ?? []).filter((s) => s.customerName);
  const { data, error } = await sb.from('erp_rp_missions').insert({
    company_id: ctx.companyId, created_by: ctx.userId, assigned_to: input.assignedTo ?? null,
    dataset_id: input.datasetId ?? null, name, mission_date: input.missionDate ?? null, status,
    meta: input.meta ?? {}, stop_count: stops.length,
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  const missionId = data.id as string;
  if (stops.length) {
    const rows = stops.map((s, i) => ({
      mission_id: missionId, company_id: ctx.companyId, seq: s.seq ?? i,
      customer_code: s.customerCode ?? null, customer_name: s.customerName, lat: s.lat ?? null, lng: s.lng ?? null,
    }));
    const { error: sErr } = await sb.from('erp_rp_mission_stops').insert(rows);
    if (sErr) { await sb.from('erp_rp_missions').delete().eq('id', missionId); return { ok: false, error: sErr.message }; }
  }
  return { ok: true, data: { id: missionId } };
}

/** Replace a mission's stops (draft/assigned only). Keeps the optimized order the manager set. */
export async function saveMissionStops(missionId: string, stops: MissionStopInput[]): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const clean = (stops ?? []).filter((s) => s.customerName);
  await sb.from('erp_rp_mission_stops').delete().eq('mission_id', missionId).eq('company_id', ctx.companyId);
  if (clean.length) {
    const rows = clean.map((s, i) => ({
      mission_id: missionId, company_id: ctx.companyId, seq: s.seq ?? i,
      customer_code: s.customerCode ?? null, customer_name: s.customerName, lat: s.lat ?? null, lng: s.lng ?? null,
    }));
    const { error } = await sb.from('erp_rp_mission_stops').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  await sb.from('erp_rp_missions').update({ stop_count: clean.length, updated_at: new Date().toISOString() }).eq('id', missionId).eq('company_id', ctx.companyId);
  return { ok: true };
}

// ── Lists ─────────────────────────────────────────────────────────────────────
export type MissionScope = 'assigned' | 'created' | 'all';
export async function listMissions(scope: MissionScope = 'all'): Promise<Result<MissionHeader[]>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  let q = sb.from('erp_rp_missions').select('*').eq('company_id', ctx.companyId);
  if (scope === 'assigned') q = q.eq('assigned_to', ctx.userId);
  else if (scope === 'created') q = q.eq('created_by', ctx.userId);
  const { data, error } = await q.order('mission_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(toHeader) };
}

export async function getMission(missionId: string): Promise<Result<{ header: MissionHeader; stops: Record<string, unknown>[]; events: Record<string, unknown>[]; report: ReturnType<typeof missionReport> }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: m, error } = await sb.from('erp_rp_missions').select('*').eq('id', missionId).eq('company_id', ctx.companyId).maybeSingle();
  if (error || !m) return { ok: false, error: error?.message ?? 'not_found' };
  const [{ data: stops }, { data: events }] = await Promise.all([
    sb.from('erp_rp_mission_stops').select('*').eq('mission_id', missionId).order('seq', { ascending: true }),
    sb.from('erp_rp_mission_events').select('*').eq('mission_id', missionId).order('at', { ascending: true }),
  ]);
  const report = missionReport((stops ?? []) as { status: string }[], (events ?? []) as { kind: string }[]);
  return { ok: true, data: { header: toHeader(m), stops: stops ?? [], events: events ?? [], report } };
}

// ── Assign + lifecycle ──────────────────────────────────────────────────────
export async function assignMission(missionId: string, supervisorId: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!perms(ctx).canAssign) return { ok: false, error: 'err_no_assign_perm' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_missions')
    .update({ assigned_to: supervisorId, status: 'assigned', updated_at: new Date().toISOString() })
    .eq('id', missionId).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Transition a mission through its lifecycle, enforcing legal transitions + capability. */
export async function transitionMission(missionId: string, to: MissionStatus): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: m } = await sb.from('erp_rp_missions').select('status, assigned_to, created_by').eq('id', missionId).eq('company_id', ctx.companyId).maybeSingle();
  if (!m) return { ok: false, error: 'not_found' };
  const from = m.status as MissionStatus;
  if (!canTransition(from, to)) return { ok: false, error: 'err_bad_transition' };
  const cap = transitionCapability(to);
  if (cap === 'assign' && !perms(ctx).canAssign) return { ok: false, error: 'err_no_assign_perm' };
  if (cap === 'review' && !perms(ctx).canReview) return { ok: false, error: 'err_no_review_perm' };

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === 'in_progress') patch.started_at = new Date().toISOString();
  if (to === 'completed') patch.completed_at = new Date().toISOString();
  if (to === 'reviewed') { patch.reviewed_by = ctx.userId; patch.reviewed_at = new Date().toISOString(); }
  const { error } = await sb.from('erp_rp_missions').update(patch).eq('id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const evKind = to === 'in_progress' ? 'start' : to === 'completed' ? 'complete' : null;
  if (evKind) await sb.from('erp_rp_mission_events').insert({ mission_id: missionId, company_id: ctx.companyId, by_user: ctx.userId, kind: evKind });
  return { ok: true };
}

// ── Execution (supervisor, mobile) ──────────────────────────────────────────
export async function checkInStop(stopId: string, gps?: { lat: number; lng: number }): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: stop } = await sb.from('erp_rp_mission_stops').select('mission_id').eq('id', stopId).eq('company_id', ctx.companyId).maybeSingle();
  if (!stop) return { ok: false, error: 'not_found' };
  const at = new Date().toISOString();
  const { error } = await sb.from('erp_rp_mission_stops')
    .update({ status: 'checked_in', check_in_at: at, check_in_lat: gps?.lat ?? null, check_in_lng: gps?.lng ?? null }).eq('id', stopId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await sb.from('erp_rp_mission_events').insert({ mission_id: stop.mission_id, stop_id: stopId, company_id: ctx.companyId, by_user: ctx.userId, kind: 'check_in', gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null });
  return { ok: true };
}

export async function checkOutStop(stopId: string, done = true): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: stop } = await sb.from('erp_rp_mission_stops').select('mission_id').eq('id', stopId).eq('company_id', ctx.companyId).maybeSingle();
  if (!stop) return { ok: false, error: 'not_found' };
  const { error } = await sb.from('erp_rp_mission_stops')
    .update({ status: done ? 'done' : 'skipped', check_out_at: new Date().toISOString() }).eq('id', stopId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await sb.from('erp_rp_mission_events').insert({ mission_id: stop.mission_id, stop_id: stopId, company_id: ctx.companyId, by_user: ctx.userId, kind: 'check_out' });
  return { ok: true };
}

/** Log a stop observation (note / photo / issue / competitor / opportunity / follow_up).
 *  Photos pass attachment ids (already uploaded to erp_attachments) in `attachments`. */
export async function addStopObservation(input: {
  missionId: string; stopId?: string | null; kind: StopObservationKind; text?: string | null;
  attachments?: string[]; gps?: { lat: number; lng: number } | null;
}): Promise<Result<{ id: string }>> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const payload: Record<string, unknown> = {};
  if (input.text) payload.text = input.text;
  if (input.attachments?.length) payload.attachments = input.attachments;
  const { data, error } = await sb.from('erp_rp_mission_events').insert({
    mission_id: input.missionId, stop_id: input.stopId ?? null, company_id: ctx.companyId, by_user: ctx.userId,
    kind: input.kind, payload, gps_lat: input.gps?.lat ?? null, gps_lng: input.gps?.lng ?? null,
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  // Mark the stop as needing follow-up when that observation is logged.
  if (input.kind === 'follow_up' && input.stopId) await sb.from('erp_rp_mission_stops').update({ follow_up: true }).eq('id', input.stopId).eq('company_id', ctx.companyId);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteMission(missionId: string): Promise<Result> {
  const ctx = await ctxOrNull(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_missions').delete().eq('id', missionId).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
