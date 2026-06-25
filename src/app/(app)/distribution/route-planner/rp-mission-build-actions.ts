'use server';

// ============================================================================
// PR-5 — Route Planner mission BUILD (admin/planner). Pick customers from a saved dataset,
// order them into stops, name the plan, assign to a rep → persists a mission +
// mission_stops on the canonical RP Missions path. Gated by the default-restrictive mission
// write perms (create; + assign when an assignee is given). Company-scoped; the RLS on
// erp_rp_missions / erp_rp_mission_stops (0363) is the backstop. No deletes. FV untouched.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { missionPermsRestrictive } from '@/lib/erp/route-planner-access';
import type { PlanCustomer } from './rp-mission-build';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
function permsFor(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>) {
  const isCompanyAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  return missionPermsRestrictive(ctx.routePlannerAccess ?? null, isCompanyAdmin);
}

function mapCustomer(r: Record<string, unknown>): PlanCustomer {
  return {
    id: r.id as string,
    code: (r.code as string | null) ?? null,
    name: (r.name as string) ?? '',
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    city: (r.city as string | null) ?? null,
    channel: (r.channel as string | null) ?? null,
    salesman: (r.salesman as string | null) ?? null,
  };
}

/** Candidate customers from a dataset for plan-building (company-scoped, optional search). */
export async function getPlanCustomers(datasetId: string, search?: string | null, limit = 500): Promise<ResultD<PlanCustomer[]>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!permsFor(ctx).canCreate) return { ok: false, error: 'err_no_create_perm' };
  const sb = await createClient();
  let q = sb.from('erp_rp_dataset_customers')
    .select('id, code, name, lat, lng, city, channel, salesman')
    .eq('company_id', ctx.companyId).eq('dataset_id', datasetId)
    .order('seq', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 2000)));
  const s = search?.trim();
  if (s) q = q.or(`code.ilike.%${s}%,name.ilike.%${s}%,city.ilike.%${s}%,channel.ilike.%${s}%`);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map(mapCustomer) };
}

/**
 * Create a mission from an ordered customer selection. The customer rows are re-read from the
 * dataset server-side (we trust the DB for code/name/coords, not the client); seq follows the
 * provided id order. status = 'assigned' when a rep is given (so it shows in their My
 * Missions), else 'draft'.
 */
export async function createMissionFromPlan(input: {
  name: string; missionDate?: string | null; assignedTo?: string | null;
  datasetId: string; orderedCustomerIds: string[];
}): Promise<ResultD<{ id: string }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const perms = permsFor(ctx);
  if (!perms.canCreate) return { ok: false, error: 'err_no_create_perm' };
  if (input.assignedTo && !perms.canAssign) return { ok: false, error: 'err_no_assign_perm' };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'err_name_required' };
  const ids = [...new Set(input.orderedCustomerIds)];
  if (ids.length === 0) return { ok: false, error: 'err_no_stops' };

  const sb = await createClient();
  // Re-read the selected customers from the dataset (company + dataset scoped).
  const { data: rows, error: e1 } = await sb.from('erp_rp_dataset_customers')
    .select('id, code, name, lat, lng')
    .eq('company_id', ctx.companyId).eq('dataset_id', input.datasetId).in('id', ids);
  if (e1) return { ok: false, error: e1.message };
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  if (ordered.length === 0) return { ok: false, error: 'err_no_stops' };

  const { data: mission, error: e2 } = await sb.from('erp_rp_missions').insert({
    company_id: ctx.companyId,
    created_by: ctx.userId,
    name,
    mission_date: input.missionDate ?? null,
    dataset_id: input.datasetId,
    assigned_to: input.assignedTo ?? null,
    status: input.assignedTo ? 'assigned' : 'draft',
    stop_count: ordered.length,
  }).select('id').single();
  if (e2 || !mission) return { ok: false, error: e2?.message ?? 'insert_failed' };
  const missionId = mission.id as string;

  const stopRows = ordered.map((r, i) => ({
    mission_id: missionId, company_id: ctx.companyId, seq: i + 1,
    customer_code: (r.code as string | null) ?? null, customer_name: (r.name as string) ?? '',
    lat: (r.lat as number | null) ?? null, lng: (r.lng as number | null) ?? null, status: 'pending',
  }));
  const { error: e3 } = await sb.from('erp_rp_mission_stops').insert(stopRows);
  if (e3) return { ok: false, error: e3.message };
  return { ok: true, data: { id: missionId } };
}
