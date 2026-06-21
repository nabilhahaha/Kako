'use server';

// ============================================================================
// Company Admin Console — company-scoped aggregates (Company 360). Reuses existing
// Planner tables; every query is company-scoped + RLS-protected, so a company admin only
// ever sees their OWN company. No platform/global data. No sales/finance.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getUserContext } from '@/lib/erp/auth-context';
import { logAudit } from '@/lib/erp/audit';
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

// ── Company user management (company-scoped) ────────────────────────────────
export interface CompanyUserRow { id: string; name: string; email: string | null; active: boolean; role: RpRole | null }

/** Company members with active status + Planner role (company-admin gated, RLS-scoped). */
export async function listCompanyUsers(): Promise<Result<CompanyUserRow[]>> {
  const ctx = await adminCtx(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const cid = ctx.companyId;
  const { data: members } = await sb.from('erp_user_branches').select('user_id, branch:erp_branches!inner(company_id)').eq('branch.company_id', cid);
  const ids = [...new Set((members ?? []).map((r) => r.user_id as string))];
  if (ids.length === 0) return { ok: true, data: [] };
  const [{ data: profiles }, { data: access }] = await Promise.all([
    sb.from('erp_profiles').select('id, full_name, email, is_active').in('id', ids),
    sb.from('erp_route_planner_access').select('user_id, role').eq('company_id', cid),
  ]);
  const roleById = new Map((access ?? []).map((a) => [a.user_id as string, a.role as RpRole]));
  const rows = (profiles ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) || (p.email as string | null) || String(p.id).slice(0, 8),
    email: (p.email as string | null) ?? null,
    active: (p as { is_active?: boolean }).is_active !== false,
    role: roleById.get(p.id as string) ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: rows };
}

/**
 * Activate / deactivate a user WITHIN the admin's own company. Security:
 *   1) caller must be a company admin (adminCtx),
 *   2) the target must be a member of the caller's company (cross-company blocked),
 *   3) no self-deactivation.
 * Only after all three is the flag flipped (service role, since erp_profiles.is_active is
 * not company-admin-writable under RLS). Audited. Platform owner / super admin bypass via
 * adminCtx but the membership check still scopes the write to the resolved company.
 */
export async function setCompanyUserActive(userId: string, active: boolean): Promise<Result> {
  const ctx = await adminCtx(); if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (userId === ctx.userId) return { ok: false, error: 'err_self' };
  const cid = ctx.companyId;

  // (2) Verify the target belongs to THIS company — service role so RLS can't hide a
  // foreign member and let a mis-scoped update slip through. Cross-company is rejected.
  let svc: ReturnType<typeof createServiceClient>;
  try { svc = createServiceClient(); } catch (e) { return { ok: false, error: `service_client: ${e instanceof Error ? e.message : 'unavailable'}` }; }
  const { data: member } = await svc.from('erp_user_branches').select('user_id, branch:erp_branches!inner(company_id)').eq('user_id', userId).eq('branch.company_id', cid).limit(1).maybeSingle();
  if (!member) return { ok: false, error: 'err_not_company_member' };

  const { error } = await svc.from('erp_profiles').update({ is_active: active }).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  const audit = await createClient();
  await logAudit(audit, { action: active ? 'activate' : 'deactivate', entity: 'planner_user', entityId: userId, companyId: cid, details: { active } });
  return { ok: true };
}
