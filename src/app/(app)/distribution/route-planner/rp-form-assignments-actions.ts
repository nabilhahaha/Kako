'use server';

// ============================================================================
// Multi-Form Field Work — form assignment admin actions (company admin / forms.admin).
//
// List / add / remove rows in erp_form_assignments (migration 0379): which users/roles/
// teams/branches a form is offered to (user-scope) and which customers it applies to
// (customer-scope: dataset/city/channel). Reserved-code forms are never assignable here.
// Definition-only; company-scoped (the erp_form_assignments RLS is the backstop). Flag-gated.
//
// Includes a graceful fallback if the 0379 table is absent in this environment's DB
// (err_assignments_pending_migration) so the UI shows a notice instead of crashing.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { isReservedFormCode } from './forms-library';
import type { AssignmentTargetType } from '@/lib/forms/form-assignments';

type Result = { ok: true } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

const VALID_TARGETS: AssignmentTargetType[] = ['user', 'role', 'team', 'department', 'branch', 'supervisor', 'dataset', 'city', 'channel'];
export const ASSIGNMENT_ROLES = ['all', 'admin', 'manager', 'supervisor', 'salesman', 'viewer'] as const;
const PENDING = 'err_assignments_pending_migration';

async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!hasPermission(ctx, 'field_verification.admin')) return { err: 'err_forbidden' as const, ctx: null };
  if (!FORM_BUILDER_ENABLED()) return { err: 'err_form_builder_disabled' as const, ctx: null };
  return { err: null, ctx };
}

/** True when the error means the 0379 table isn't present in this environment's DB yet. */
function assignmentsMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202'
    || msg.includes('does not exist') || msg.includes('schema cache');
}

/** Confirm a form belongs to the caller's company and is not a reserved (dedicated) form. */
async function ownNonReservedForm(sb: Awaited<ReturnType<typeof createClient>>, companyId: string, formId: string): Promise<boolean> {
  const { data } = await sb.from('erp_forms').select('code').eq('company_id', companyId).eq('id', formId).maybeSingle();
  return !!data && !isReservedFormCode((data as { code: string }).code);
}

export interface FormAssignmentRow {
  id: string;
  targetType: AssignmentTargetType;
  targetValue: string;
  isActive: boolean;
  createdAt: string;
}

/** All assignments for a form. */
export async function listFormAssignments(formId: string): Promise<ResultD<FormAssignmentRow[]>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  if (!(await ownNonReservedForm(sb, ctx.companyId!, formId))) return { ok: false, error: 'err_not_found' };

  const { data, error } = await sb.from('erp_form_assignments')
    .select('id, target_type, target_value, is_active, created_at')
    .eq('company_id', ctx.companyId).eq('form_id', formId)
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: assignmentsMissing(error) ? PENDING : error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      targetType: r.target_type as AssignmentTargetType,
      targetValue: r.target_value as string,
      isActive: !!r.is_active,
      createdAt: r.created_at as string,
    })),
  };
}

/** Add an assignment target to a form (idempotent on the UNIQUE(form,type,value)). */
export async function addFormAssignment(formId: string, targetType: AssignmentTargetType, targetValue: string): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  if (!VALID_TARGETS.includes(targetType)) return { ok: false, error: 'err_bad_target' };
  const value = (targetValue ?? '').trim();
  if (!value) return { ok: false, error: 'err_bad_value' };
  if (targetType === 'role' && !(ASSIGNMENT_ROLES as readonly string[]).includes(value)) return { ok: false, error: 'err_bad_value' };

  const sb = await createClient();
  if (!(await ownNonReservedForm(sb, ctx.companyId!, formId))) return { ok: false, error: 'err_not_found' };

  const { error } = await sb.from('erp_form_assignments')
    .upsert({ company_id: ctx.companyId, form_id: formId, target_type: targetType, target_value: value, is_active: true, created_by: ctx.userId },
            { onConflict: 'form_id,target_type,target_value' });
  if (error) return { ok: false, error: assignmentsMissing(error) ? PENDING : error.message };

  await logAudit(sb, { action: 'assign', entity: 'form', entityId: formId, companyId: ctx.companyId, details: { targetType, targetValue: value } });
  revalidatePath(`/field-verification/forms/${formId}/assign`);
  return { ok: true };
}

/** Remove an assignment. */
export async function removeFormAssignment(id: string): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { error } = await sb.from('erp_form_assignments').delete().eq('company_id', ctx.companyId).eq('id', id);
  if (error) return { ok: false, error: assignmentsMissing(error) ? PENDING : error.message };
  await logAudit(sb, { action: 'unassign', entity: 'form', entityId: id, companyId: ctx.companyId });
  return { ok: true };
}

// ── Facets (the option lists the assignment picker needs) ────────────────────

export interface AssignmentFacets {
  users: { id: string; name: string; email: string }[];
  roles: string[];
  teams: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  datasets: { id: string; name: string }[];
  cities: string[];
  channels: string[];
}

/** Option lists for the assignment picker, all company-scoped. Each source is best-effort
 *  (a missing optional table just yields an empty list). */
export async function getAssignmentFacets(): Promise<ResultD<AssignmentFacets>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const companyId = ctx.companyId!;

  // Company members → user picker (also used for supervisor targets).
  const users: AssignmentFacets['users'] = [];
  const { data: branchRows } = await sb.from('erp_branches').select('id, code, name').eq('company_id', companyId);
  const branchIds = (branchRows ?? []).map((b) => b.id as string);
  if (branchIds.length > 0) {
    const { data: ub } = await sb.from('erp_user_branches').select('user_id').in('branch_id', branchIds);
    const userIds = [...new Set((ub ?? []).map((r) => r.user_id as string).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profs } = await sb.from('erp_profiles').select('id, full_name, email').in('id', userIds);
      for (const p of profs ?? []) {
        users.push({ id: p.id as string, name: (p.full_name as string | null) ?? (p.email as string), email: (p.email as string | null) ?? '' });
      }
      users.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const branches = (branchRows ?? []).map((b) => ({ id: b.id as string, name: ((b.name as string | null) ?? (b.code as string | null) ?? '') }));

  const { data: teamRows } = await sb.from('erp_teams').select('id, name').eq('company_id', companyId);
  const teams = (teamRows ?? []).map((t) => ({ id: t.id as string, name: (t.name as string | null) ?? '' }));

  const { data: dsRows } = await sb.from('erp_rp_datasets').select('id, name, status').eq('company_id', companyId);
  const datasets = (dsRows ?? [])
    .filter((d) => (d.status as string | null) !== 'archived')
    .map((d) => ({ id: d.id as string, name: (d.name as string | null) ?? '' }));

  const { data: catRows } = await sb.from('erp_rp_verification_catalog').select('kind, value, active').eq('company_id', companyId);
  const cities: string[] = [];
  const channels: string[] = [];
  for (const c of catRows ?? []) {
    if ((c.active as boolean | null) === false) continue;
    if ((c.kind as string) === 'city') cities.push(c.value as string);
    else if ((c.kind as string) === 'channel') channels.push(c.value as string);
  }

  return { ok: true, data: { users, roles: [...ASSIGNMENT_ROLES], teams, branches, datasets, cities, channels } };
}
