'use server';

// ============================================================================
// PR-6 — Route Planner mission TRACKING (supervisor / admin, read-only). Surfaces the
// canonical RP Missions (erp_rp_missions + stops + events) as a progress board: completed
// vs pending per mission, per-rep rollups, and a route map + activity feed per mission.
// Visibility is enforced by RLS on erp_rp_missions (0363: company scope + reporting graph),
// so a supervisor sees their team and an admin sees the company. No writes. FV untouched.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { runProgress, type MissionRunStop } from './rp-mission-exec';
import type { TrackingRow } from './rp-mission-tracking';
import type { ExportStop } from './rp-mission-export';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function trackGate() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ctx: null, ok: false as const };
  const ok = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin'
    || hasAnyPermission(ctx, ['route_planner.view', 'route_planner.edit', 'reports.view']);
  return { ctx: ok ? ctx : null, ok };
}

/** All missions visible to the caller (RLS-scoped) with computed progress + assignee name. */
export async function getMissionTracking(): Promise<ResultD<TrackingRow[]>> {
  const g = await trackGate();
  if (!g.ok || !g.ctx) return { ok: false, error: 'err_forbidden' };
  const ctx = g.ctx;
  const sb = await createClient();
  const { data: missions, error } = await sb
    .from('erp_rp_missions')
    .select('id, name, mission_date, status, assigned_to')
    .eq('company_id', ctx.companyId)
    .neq('status', 'archived')
    .order('mission_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const ids = (missions ?? []).map((m) => m.id as string);

  // stop statuses for those missions → per-mission progress
  const statusByMission = new Map<string, { status: string }[]>();
  if (ids.length > 0) {
    const { data: stops } = await sb.from('erp_rp_mission_stops')
      .select('mission_id, status').eq('company_id', ctx.companyId).in('mission_id', ids);
    for (const s of stops ?? []) {
      const mid = s.mission_id as string;
      (statusByMission.get(mid) ?? statusByMission.set(mid, []).get(mid)!).push({ status: s.status as string });
    }
  }
  // assignee names
  const assigneeIds = [...new Set((missions ?? []).map((m) => m.assigned_to as string | null).filter((x): x is string => !!x))];
  const nameById = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profs } = await sb.from('erp_profiles').select('id, full_name, email').in('id', assigneeIds);
    for (const p of profs ?? []) nameById.set(p.id as string, (p.full_name as string) || (p.email as string) || (p.id as string));
  }

  const rows: TrackingRow[] = (missions ?? []).map((m) => {
    const p = runProgress(statusByMission.get(m.id as string) ?? []);
    const aid = (m.assigned_to as string | null) ?? null;
    return {
      id: m.id as string,
      name: (m.name as string) ?? '',
      missionDate: (m.mission_date as string | null) ?? null,
      status: (m.status as TrackingRow['status']) ?? 'assigned',
      assigneeId: aid,
      assigneeName: aid ? (nameById.get(aid) ?? null) : null,
      total: p.total, done: p.done, skipped: p.skipped, pending: p.pending, checkedIn: p.checkedIn, pct: p.pct,
    };
  });
  return { ok: true, data: rows };
}

/** PR-7 — flattened mission + stop data for the RP execution export (RLS-scoped, read-only). */
export async function getMissionExportData(): Promise<ResultD<{ missions: TrackingRow[]; stops: ExportStop[] }>> {
  const g = await trackGate();
  if (!g.ok || !g.ctx) return { ok: false, error: 'err_forbidden' };
  const ctx = g.ctx;
  const sb = await createClient();
  const { data: missions, error } = await sb
    .from('erp_rp_missions')
    .select('id, name, mission_date, status, assigned_to')
    .eq('company_id', ctx.companyId).neq('status', 'archived')
    .order('mission_date', { ascending: false, nullsFirst: false }).limit(500);
  if (error) return { ok: false, error: error.message };
  const ids = (missions ?? []).map((m) => m.id as string);

  const stopsByMission = new Map<string, Record<string, unknown>[]>();
  if (ids.length > 0) {
    const { data: stops } = await sb.from('erp_rp_mission_stops')
      .select('mission_id, seq, customer_code, customer_name, status, check_in_at, check_out_at, notes')
      .eq('company_id', ctx.companyId).in('mission_id', ids).order('seq', { ascending: true });
    for (const s of stops ?? []) {
      const mid = s.mission_id as string;
      (stopsByMission.get(mid) ?? stopsByMission.set(mid, []).get(mid)!).push(s);
    }
  }
  const assigneeIds = [...new Set((missions ?? []).map((m) => m.assigned_to as string | null).filter((x): x is string => !!x))];
  const nameById = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profs } = await sb.from('erp_profiles').select('id, full_name, email').in('id', assigneeIds);
    for (const p of profs ?? []) nameById.set(p.id as string, (p.full_name as string) || (p.email as string) || (p.id as string));
  }

  const missionRows: TrackingRow[] = [];
  const stopRows: ExportStop[] = [];
  for (const m of missions ?? []) {
    const mid = m.id as string;
    const aid = (m.assigned_to as string | null) ?? null;
    const repName = aid ? (nameById.get(aid) ?? null) : null;
    const rawStops = stopsByMission.get(mid) ?? [];
    const p = runProgress(rawStops.map((s) => ({ status: s.status as string })));
    missionRows.push({
      id: mid, name: (m.name as string) ?? '', missionDate: (m.mission_date as string | null) ?? null,
      status: (m.status as TrackingRow['status']) ?? 'assigned', assigneeId: aid, assigneeName: repName,
      total: p.total, done: p.done, skipped: p.skipped, pending: p.pending, checkedIn: p.checkedIn, pct: p.pct,
    });
    for (const s of rawStops) {
      stopRows.push({
        missionName: (m.name as string) ?? '', assigneeName: repName, seq: Number(s.seq ?? 0),
        customerCode: (s.customer_code as string | null) ?? null, customerName: (s.customer_name as string) ?? '',
        status: (s.status as string) ?? 'pending',
        checkInAt: (s.check_in_at as string | null) ?? null, checkOutAt: (s.check_out_at as string | null) ?? null,
        notes: (s.notes as string | null) ?? null,
      });
    }
  }
  return { ok: true, data: { missions: missionRows, stops: stopRows } };
}

export interface TrackingEvent { kind: string; at: string | null; stopId: string | null; byUser: string | null }

/** A single mission's stops + recent activity for the tracking detail (route map + feed). */
export async function getMissionTrackingDetail(missionId: string): Promise<ResultD<{ name: string; status: string; stops: MissionRunStop[]; events: TrackingEvent[] }>> {
  const g = await trackGate();
  if (!g.ok || !g.ctx) return { ok: false, error: 'err_forbidden' };
  const ctx = g.ctx;
  const sb = await createClient();
  const { data: mission, error: e0 } = await sb.from('erp_rp_missions')
    .select('name, status').eq('id', missionId).eq('company_id', ctx.companyId).maybeSingle();
  if (e0 || !mission) return { ok: false, error: e0?.message ?? 'err_not_found' };
  const { data: stops, error } = await sb.from('erp_rp_mission_stops')
    .select('id, seq, customer_code, customer_name, lat, lng, status, check_in_at, check_out_at, notes')
    .eq('company_id', ctx.companyId).eq('mission_id', missionId).order('seq', { ascending: true });
  if (error) return { ok: false, error: error.message };
  const { data: events } = await sb.from('erp_rp_mission_events')
    .select('kind, at, stop_id, by_user').eq('company_id', ctx.companyId).eq('mission_id', missionId)
    .order('at', { ascending: false }).limit(100);
  return {
    ok: true,
    data: {
      name: (mission.name as string) ?? '',
      status: (mission.status as string) ?? '',
      stops: (stops ?? []).map((r) => ({
        id: r.id as string, seq: Number(r.seq ?? 0),
        customerCode: (r.customer_code as string | null) ?? null, customerName: (r.customer_name as string) ?? '',
        lat: (r.lat as number | null) ?? null, lng: (r.lng as number | null) ?? null,
        status: (r.status as MissionRunStop['status']) ?? 'pending',
        checkInAt: (r.check_in_at as string | null) ?? null, checkOutAt: (r.check_out_at as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
      })),
      events: (events ?? []).map((e) => ({ kind: e.kind as string, at: (e.at as string | null) ?? null, stopId: (e.stop_id as string | null) ?? null, byUser: (e.by_user as string | null) ?? null })),
    },
  };
}
