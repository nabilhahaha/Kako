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

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

export interface SavedPlanRow {
  id: string; name: string; status: 'active' | 'archived';
  assignedTo: string | null; datasetId: string | null;
  plan: Record<string, unknown>; frequencies?: Record<string, string>;
  sourceJourneyId?: string | null; createdAt: number; updatedAt: number;
}

function rowToPlan(r: Record<string, unknown>): SavedPlanRow {
  return {
    id: r.id as string, name: (r.name as string) ?? '', status: (r.status as 'active' | 'archived') ?? 'active',
    assignedTo: (r.assigned_to as string | null) ?? null, datasetId: (r.dataset_id as string | null) ?? null,
    plan: (r.plan as Record<string, unknown>) ?? {}, frequencies: (r.frequencies as Record<string, string>) ?? undefined,
    sourceJourneyId: (r.source_journey_id as string | null) ?? null,
    createdAt: new Date(r.created_at as string).getTime(), updatedAt: new Date((r.updated_at as string) ?? (r.created_at as string)).getTime(),
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
