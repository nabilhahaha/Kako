'use server';

// ============================================================================
// Phase D1b — Route Planner mission WRITE actions (create / assign / status).
// Gated by the D1a default-restrictive access layer:
//   * explicit access row → its role/override capability
//   * no row + company admin → full
//   * no row + normal user → DENIED
// Every write is company-scoped; the DB RLS on erp_rp_missions (0363:
// company scope + creator/assignee/admin) is the backstop. No deletes here.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { missionPermsRestrictive, type MissionPerms } from '@/lib/erp/route-planner-access';
import { canTransition, transitionCapability, type MissionStatus } from '@/lib/erp/route-planner-mission';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
function permsFor(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): MissionPerms {
  const isCompanyAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  return missionPermsRestrictive(ctx.routePlannerAccess ?? null, isCompanyAdmin);
}

/** Effective mission-write capabilities for the current user (drives UI gating). */
export async function getMyMissionWritePerms(): Promise<ResultD<MissionPerms>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  return { ok: true, data: permsFor(ctx) };
}

/** Company users that a mission can be assigned to (for the assign picker). Company-scoped. */
export async function listMissionAssignees(): Promise<ResultD<{ id: string; name: string }[]>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!permsFor(ctx).canAssign) return { ok: false, error: 'err_no_assign_perm' };
  const sb = await createClient();
  const { data: branches } = await sb.from('erp_branches').select('id').eq('company_id', ctx.companyId);
  const branchIds = (branches ?? []).map((b) => b.id as string);
  if (branchIds.length === 0) return { ok: true, data: [] };
  const { data: ub } = await sb.from('erp_user_branches').select('user_id').in('branch_id', branchIds);
  const userIds = [...new Set((ub ?? []).map((r) => r.user_id as string))];
  if (userIds.length === 0) return { ok: true, data: [] };
  const { data: profiles, error } = await sb.from('erp_profiles').select('id, name, email').in('id', userIds);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (profiles ?? []).map((p) => ({ id: p.id as string, name: (p.name as string) || (p.email as string) || (p.id as string) })) };
}

/** Create a mission (draft, or assigned when an assignee is given). created_by = the author
 *  (RLS requires it); status starts 'draft'. */
export async function createMission(input: { name: string; missionDate?: string | null; assignedTo?: string | null }): Promise<ResultD<{ id: string }>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const perms = permsFor(ctx);
  if (!perms.canCreate) return { ok: false, error: 'err_no_create_perm' };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'err_name_required' };
  if (input.assignedTo && !perms.canAssign) return { ok: false, error: 'err_no_assign_perm' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_missions').insert({
    company_id: ctx.companyId,
    created_by: ctx.userId,
    name,
    mission_date: input.missionDate ?? null,
    assigned_to: input.assignedTo ?? null,
    status: input.assignedTo ? 'assigned' : 'draft',
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, data: { id: data.id as string } };
}

/** Assign (or clear) a mission's owner. Requires the assign capability. */
export async function assignMission(missionId: string, userId: string | null): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!permsFor(ctx).canAssign) return { ok: false, error: 'err_no_assign_perm' };
  const sb = await createClient();
  const { error } = await sb.from('erp_rp_missions')
    .update({ assigned_to: userId, status: userId ? 'assigned' : 'draft', updated_at: new Date().toISOString() })
    .eq('id', missionId).eq('company_id', ctx.companyId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

const EVENT_FOR: Partial<Record<MissionStatus, 'start' | 'pause' | 'resume' | 'complete'>> = {
  in_progress: 'start',
  completed: 'complete',
};

/** Advance a mission to a new status. Validates the transition (route-planner-mission) and
 *  the capability it requires (assign/review), then updates + logs an event. */
export async function transitionMissionStatus(missionId: string, to: MissionStatus): Promise<Result> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const perms = permsFor(ctx);
  const sb = await createClient();
  const { data: cur, error: e1 } = await sb.from('erp_rp_missions').select('status').eq('id', missionId).eq('company_id', ctx.companyId).maybeSingle();
  if (e1 || !cur) return { ok: false, error: e1?.message ?? 'err_not_found' };
  const from = cur.status as MissionStatus;
  if (!canTransition(from, to)) return { ok: false, error: 'err_bad_transition' };
  const cap = transitionCapability(to);
  if (cap === 'assign' && !perms.canAssign) return { ok: false, error: 'err_no_assign_perm' };
  if (cap === 'review' && !perms.canReview) return { ok: false, error: 'err_no_review_perm' };
  if (cap === null && !(perms.canExecute || perms.canCreate || perms.canAssign || perms.canReview)) return { ok: false, error: 'err_no_perm' };
  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === 'in_progress') patch.started_at = new Date().toISOString();
  if (to === 'completed') patch.completed_at = new Date().toISOString();
  if (to === 'reviewed') { patch.reviewed_by = ctx.userId; patch.reviewed_at = new Date().toISOString(); }
  const { error } = await sb.from('erp_rp_missions').update(patch).eq('id', missionId).eq('company_id', ctx.companyId);
  if (error) return { ok: false, error: error.message };
  const evKind = EVENT_FOR[to];
  if (evKind) await sb.from('erp_rp_mission_events').insert({ mission_id: missionId, company_id: ctx.companyId, by_user: ctx.userId, kind: evKind });
  return { ok: true };
}
