'use server';

// ============================================================================
// PR-4 — Route Planner mission EXECUTION (rep mobile). The canonical RP Missions path:
//   erp_rp_missions → erp_rp_mission_stops → erp_rp_mission_events.
//
// The ASSIGNED rep runs their mission: start → per-stop check-in → notes/photos →
// mark done (or skip) → complete. Authorisation uses canExecuteMission: the assignee can
// always execute their own mission; otherwise the default-restrictive write perms apply.
// Every write is company-scoped; the RLS on these tables (0363: company scope +
// creator/assignee/admin) is the backstop. No deletes. Field Verification is untouched.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { canExecuteMission } from '@/lib/erp/route-planner-access';
import type { StopObservationKind } from '@/lib/erp/route-planner-mission';
import type { MissionRunStop, MissionRunRow } from './rp-mission-exec';
import { runProgress } from './rp-mission-exec';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
}

/** Load a mission I'm allowed to EXECUTE (assignee or admin/exec-capable). Returns the row. */
async function loadExecutableMission(
  ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>,
  missionId: string,
): Promise<{ ok: true; assigned_to: string | null; status: string } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data, error } = await sb
    .from('erp_rp_missions')
    .select('assigned_to, status')
    .eq('id', missionId).eq('company_id', ctx.companyId).maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'err_not_found' };
  const isAssignee = (data.assigned_to as string | null) === ctx.userId;
  if (!canExecuteMission(ctx.routePlannerAccess ?? null, { isCompanyAdmin: isAdmin(ctx), isAssignee })) {
    return { ok: false, error: 'err_no_execute_perm' };
  }
  return { ok: true, assigned_to: (data.assigned_to as string | null), status: data.status as string };
}

function mapStop(r: Record<string, unknown>): MissionRunStop {
  return {
    id: r.id as string,
    seq: Number(r.seq ?? 0),
    customerCode: (r.customer_code as string | null) ?? null,
    customerName: (r.customer_name as string) ?? '',
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    status: (r.status as MissionRunStop['status']) ?? 'pending',
    checkInAt: (r.check_in_at as string | null) ?? null,
    checkOutAt: (r.check_out_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

/** Missions assigned to the current user (the rep's "My Missions" list) + progress. */
export async function getMyMissions(): Promise<ResultD<MissionRunRow[]>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: missions, error } = await sb
    .from('erp_rp_missions')
    .select('id, name, mission_date, status')
    .eq('company_id', ctx.companyId)
    .eq('assigned_to', ctx.userId)
    .neq('status', 'archived')
    .order('mission_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  const ids = (missions ?? []).map((m) => m.id as string);
  const statusByMission = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: stops } = await sb
      .from('erp_rp_mission_stops')
      .select('mission_id, status')
      .eq('company_id', ctx.companyId)
      .in('mission_id', ids);
    for (const s of stops ?? []) {
      const mid = s.mission_id as string;
      (statusByMission.get(mid) ?? statusByMission.set(mid, []).get(mid)!).push(s.status as string);
    }
  }
  const rows: MissionRunRow[] = (missions ?? []).map((m) => {
    const statuses = (statusByMission.get(m.id as string) ?? []).map((status) => ({ status }));
    const p = runProgress(statuses);
    return {
      id: m.id as string,
      name: (m.name as string) ?? '',
      missionDate: (m.mission_date as string | null) ?? null,
      status: (m.status as MissionRunRow['status']) ?? 'assigned',
      stopCount: p.total,
      doneCount: p.done,
      pct: p.pct,
    };
  });
  return { ok: true, data: rows };
}

/** Full mission + ordered stops for the runner screen (assignee/admin only). */
export async function getMissionRun(missionId: string): Promise<ResultD<{ id: string; name: string; missionDate: string | null; status: string; stops: MissionRunStop[] }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = await createClient();
  const { data: mission } = await sb
    .from('erp_rp_missions').select('id, name, mission_date, status')
    .eq('id', missionId).eq('company_id', ctx.companyId).single();
  const { data: stops, error } = await sb
    .from('erp_rp_mission_stops')
    .select('id, seq, customer_code, customer_name, lat, lng, status, check_in_at, check_out_at, notes')
    .eq('company_id', ctx.companyId).eq('mission_id', missionId)
    .order('seq', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: {
      id: missionId,
      name: (mission?.name as string) ?? '',
      missionDate: (mission?.mission_date as string | null) ?? null,
      status: (mission?.status as string) ?? 'assigned',
      stops: (stops ?? []).map(mapStop),
    },
  };
}

/** Log a mission event (best-effort within the same write; never blocks the state change). */
async function logEvent(
  sb: Awaited<ReturnType<typeof createClient>>,
  ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>,
  missionId: string,
  stopId: string | null,
  kind: string,
  opts: { lat?: number | null; lng?: number | null; payload?: Record<string, unknown> } = {},
) {
  await sb.from('erp_rp_mission_events').insert({
    mission_id: missionId, stop_id: stopId, company_id: ctx.companyId, by_user: ctx.userId,
    kind, gps_lat: opts.lat ?? null, gps_lng: opts.lng ?? null, payload: opts.payload ?? {},
  });
}

/** Mark the mission in progress (assigned → in_progress). Idempotent. */
export async function startMission(missionId: string): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (guard.status === 'in_progress') return { ok: true };
  if (guard.status !== 'assigned' && guard.status !== 'draft') return { ok: false, error: 'err_bad_transition' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_missions')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logEvent(sb, ctx, missionId, null, 'start');
  return { ok: true };
}

/** Check in at a stop (pending → checked_in) with the rep's GPS; auto-starts the mission. */
export async function checkInStop(missionId: string, stopId: string, gps: { lat: number; lng: number } | null): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = await createClient();
  const now = new Date().toISOString();
  if (guard.status === 'assigned' || guard.status === 'draft') {
    await sb.from('erp_rp_missions').update({ status: 'in_progress', started_at: now, updated_at: now }).eq('id', missionId).eq('company_id', ctx.companyId);
  }
  const { error } = await sb.from('erp_rp_mission_stops')
    .update({ status: 'checked_in', check_in_at: now, check_in_lat: gps?.lat ?? null, check_in_lng: gps?.lng ?? null })
    .eq('id', stopId).eq('mission_id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logEvent(sb, ctx, missionId, stopId, 'check_in', { lat: gps?.lat, lng: gps?.lng });
  return { ok: true };
}

/** Complete a stop (→ done) with optional notes + photo attachment ids + closing GPS. */
export async function completeStop(missionId: string, stopId: string, input: { gps?: { lat: number; lng: number } | null; notes?: string | null; photoIds?: string[] } = {}): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = await createClient();
  const now = new Date().toISOString();
  const notes = input.notes?.trim() || null;
  const { error } = await sb.from('erp_rp_mission_stops')
    .update({ status: 'done', check_out_at: now, ...(notes ? { notes } : {}) })
    .eq('id', stopId).eq('mission_id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logEvent(sb, ctx, missionId, stopId, 'check_out', { lat: input.gps?.lat, lng: input.gps?.lng });
  if (notes) await logEvent(sb, ctx, missionId, stopId, 'note', { payload: { text: notes } });
  for (const pid of input.photoIds ?? []) await logEvent(sb, ctx, missionId, stopId, 'photo', { payload: { attachment_id: pid } });
  return { ok: true };
}

/** Skip a stop (→ skipped) with a reason. */
export async function skipStop(missionId: string, stopId: string, reason?: string | null): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_mission_stops')
    .update({ status: 'skipped', check_out_at: new Date().toISOString() })
    .eq('id', stopId).eq('mission_id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logEvent(sb, ctx, missionId, stopId, 'note', { payload: { skipped: true, reason: reason?.trim() || null } });
  return { ok: true };
}

/** Add an observation at a stop (note / issue / competitor / opportunity / follow-up / photo). */
export async function addStopObservation(missionId: string, stopId: string, kind: StopObservationKind, payload?: Record<string, unknown>): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = await createClient();
  await logEvent(sb, ctx, missionId, stopId, kind, { payload: payload ?? {} });
  return { ok: true };
}

/** Complete the whole mission (in_progress → completed). */
export async function completeMission(missionId: string): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const guard = await loadExecutableMission(ctx, missionId);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (guard.status !== 'in_progress') return { ok: false, error: 'err_bad_transition' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_missions')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  await logEvent(sb, ctx, missionId, null, 'complete');
  return { ok: true };
}
