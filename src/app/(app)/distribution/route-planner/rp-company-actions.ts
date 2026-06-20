'use server';

// ============================================================================
// Company Admin Console — company-scoped aggregates (Company 360). Reuses existing
// Planner tables; every query is company-scoped + RLS-protected, so a company admin only
// ever sees their OWN company. No platform/global data. No sales/finance.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { RP_ROLES, type RpRole } from '@/lib/erp/route-planner-access';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return null;
  const isAdmin = ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.topRole === 'admin' || ctx.isRoutePlannerAdmin
    || ctx.routePlannerAccess?.role === 'route_planner_admin';
  return isAdmin ? ctx : null;
}

export interface CompanyOverview {
  users: { total: number; byRole: Record<RpRole, number>; active: number; inGraph: number };
  datasets: { count: number; activeName: string | null; activeRows: number };
  latestSync: { at: number; status: string; label: string | null } | null;
  requests: { total: number; pending: number };
  missions: { total: number; active: number };
}

/** Company 360 aggregates — all RLS-scoped to the admin's company. */
export async function companyOverview(): Promise<Result<CompanyOverview>> {
  const ctx = await adminCtx(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const cid = ctx.companyId;

  // Members of the company (distinct users across its branches).
  const { data: memberRows } = await sb.from('erp_user_branches')
    .select('user_id, branch:erp_branches!inner(company_id)').eq('branch.company_id', cid);
  const memberIds = [...new Set((memberRows ?? []).map((r) => r.user_id as string))];

  // Planner access rows (role per user) + active profiles.
  const [{ data: accessRows }, { data: profiles }] = await Promise.all([
    sb.from('erp_route_planner_access').select('user_id, role').eq('company_id', cid),
    memberIds.length ? sb.from('erp_profiles').select('id, is_active').in('id', memberIds) : Promise.resolve({ data: [] as { id: string; is_active: boolean }[] }),
  ]);
  const byRole = Object.fromEntries(RP_ROLES.map((r) => [r, 0])) as Record<RpRole, number>;
  for (const a of accessRows ?? []) { const role = a.role as RpRole; if (role in byRole) byRole[role]++; }
  const active = (profiles ?? []).filter((p) => (p as { is_active?: boolean }).is_active !== false).length;

  // Datasets + active.
  const { data: datasets } = await sb.from('erp_rp_datasets').select('name, valid_count, is_active').eq('company_id', cid);
  const activeDs = (datasets ?? []).find((d) => d.is_active);

  // Latest sync.
  const { data: sync } = await sb.from('erp_rp_sync_runs').select('started_at, status, source_label').eq('company_id', cid).order('started_at', { ascending: false }).limit(1).maybeSingle();

  // Requests (pending = not terminal).
  const { count: reqTotal } = await sb.from('erp_route_planner_requests').select('id', { count: 'exact', head: true }).eq('company_id', cid);
  const { count: reqPending } = await sb.from('erp_route_planner_requests').select('id', { count: 'exact', head: true }).eq('company_id', cid)
    .not('status', 'in', '(closed,rejected,cancelled,implemented_externally)');

  // Missions.
  const { count: misTotal } = await sb.from('erp_rp_missions').select('id', { count: 'exact', head: true }).eq('company_id', cid);
  const { count: misActive } = await sb.from('erp_rp_missions').select('id', { count: 'exact', head: true }).eq('company_id', cid).in('status', ['assigned', 'in_progress']);

  return {
    ok: true,
    data: {
      users: { total: memberIds.length, byRole, active, inGraph: (accessRows ?? []).length },
      datasets: { count: (datasets ?? []).length, activeName: (activeDs?.name as string | null) ?? null, activeRows: (activeDs?.valid_count as number) ?? 0 },
      latestSync: sync ? { at: new Date(sync.started_at as string).getTime(), status: sync.status as string, label: (sync.source_label as string | null) ?? null } : null,
      requests: { total: reqTotal ?? 0, pending: reqPending ?? 0 },
      missions: { total: misTotal ?? 0, active: misActive ?? 0 },
    },
  };
}
