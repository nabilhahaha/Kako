'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { wouldCycle, type RpNode } from '@/lib/erp/route-planner-reporting';

/**
 * Reporting Graph Admin — server actions over the reporting edges on
 * erp_route_planner_access (migration 0354): primary_manager_id, secondary_manager_id,
 * see_all. Reads are RLS-scoped; writes are additionally gated on the company admin
 * (DB RLS already enforces erp_is_company_admin; we also gate in-app). These edges drive
 * VISIBILITY (rp_visible_users) and are kept INDEPENDENT of territory ownership.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return null;
  const isAdmin = ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.topRole === 'admin' || ctx.isRoutePlannerAdmin;
  return isAdmin ? ctx : null;
}

export interface ReportingGraphData {
  /** Every company user (members of the tenant), enriched with their access-row edges. */
  nodes: RpNode[];
  /** The signed-in admin's own id (for "you" markers). */
  meId: string;
}

/**
 * Load the reporting graph for the admin's company: all company members (from their
 * branch memberships) merged with their erp_route_planner_access reporting edges. Users
 * without an access row appear as inGraph:false (not yet placed in the graph).
 */
export async function listReportingGraph(): Promise<Result<ReportingGraphData>> {
  const ctx = await adminCtx(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const companyId = ctx.companyId!;

  // 1) Company members: user_ids that belong to a branch of this company.
  const { data: memberRows, error: mErr } = await sb
    .from('erp_user_branches')
    .select('user_id, branch:erp_branches!inner(company_id)')
    .eq('branch.company_id', companyId);
  if (mErr) return { ok: false, error: mErr.message };
  const memberIds = [...new Set((memberRows ?? []).map((r) => r.user_id as string))];

  // 2) Access rows (reporting edges) for this company.
  const { data: accessRows, error: aErr } = await sb
    .from('erp_route_planner_access')
    .select('user_id, role, primary_manager_id, secondary_manager_id, see_all, is_active')
    .eq('company_id', companyId);
  if (aErr) return { ok: false, error: aErr.message };
  const accessById = new Map((accessRows ?? []).map((r) => [r.user_id as string, r]));

  // Union of all ids we need profile names for (members + any referenced managers).
  const ids = new Set<string>(memberIds);
  for (const r of accessRows ?? []) {
    ids.add(r.user_id as string);
    if (r.primary_manager_id) ids.add(r.primary_manager_id as string);
    if (r.secondary_manager_id) ids.add(r.secondary_manager_id as string);
  }

  // 3) Profiles for display.
  const { data: profiles } = await sb.from('erp_profiles').select('id, full_name, email').in('id', [...ids]);
  const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const nodes: RpNode[] = [...ids].map((id) => {
    const a = accessById.get(id);
    const p = profById.get(id);
    return {
      userId: id,
      name: (p?.full_name as string | null) || (p?.email as string | null) || id.slice(0, 8),
      email: (p?.email as string | null) ?? null,
      role: (a?.role as string | null) ?? null,
      primaryManagerId: (a?.primary_manager_id as string | null) ?? null,
      secondaryManagerId: (a?.secondary_manager_id as string | null) ?? null,
      seeAll: Boolean(a?.see_all),
      inGraph: Boolean(a),
    };
  }).sort((x, y) => x.name.localeCompare(y.name));

  return { ok: true, data: { nodes, meId: ctx.userId } };
}

/**
 * Set the reporting edges (and see_all) for a user. Upserts the access row: a new row
 * gets the table's default role/features; an existing row keeps them (only the edges
 * change). Rejects self-management and cycles (validated against the current graph).
 */
export async function setReporting(
  userId: string,
  edges: { primaryManagerId: string | null; secondaryManagerId: string | null; seeAll: boolean },
): Promise<Result> {
  const ctx = await adminCtx(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const primary = edges.primaryManagerId || null;
  const secondary = edges.secondaryManagerId || null;
  if (primary && primary === secondary) return { ok: false, error: 'err_same_manager' };

  // Cycle / self guard against the current graph.
  const current = await listReportingGraph();
  if (current.ok && wouldCycle(current.data!.nodes, userId, primary, secondary)) {
    return { ok: false, error: 'err_cycle' };
  }

  const sb = await createClient();
  const { error } = await sb.from('erp_route_planner_access').upsert({
    company_id: ctx.companyId, user_id: userId,
    primary_manager_id: primary, secondary_manager_id: secondary, see_all: edges.seeAll,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,user_id' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Clear a user's reporting edges + see_all (keeps the access row, role and features). */
export async function clearReporting(userId: string): Promise<Result> {
  return setReporting(userId, { primaryManagerId: null, secondaryManagerId: null, seeAll: false });
}
