'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import type { UserContext } from '@/lib/erp/auth-context';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Company-admin org-structure management. Generic departments / teams / job
// titles + per-employee assignment & reporting lines.
//
// Defense in depth: the authoritative guard is RLS — erp_departments/teams/
// job_titles are `FOR ALL USING (platform_owner OR erp_is_company_admin(company_id))`,
// and erp_user_branches writes are restricted to the caller's own branches — so a
// company admin can only ever touch their OWN company's rows. App-side we require
// the `settings.users` permission (people/org administration) as a fast fail and
// for a consistent permission model, and we audit every mutation.

async function guard(): Promise<{ ctx: UserContext; error: null } | { ctx: null; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ctx: null, error: error ?? 'unauthorized' };
  if (!hasPermission(ctx, 'settings.users')) return { ctx: null, error: 'unauthorized' };
  return { ctx, error: null };
}

function nullable(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

// ── Departments ─────────────────────────────────────────────────────────────

export async function upsertDepartment(formData: FormData): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const id = nullable(formData.get('id'));
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const payload = {
    name,
    name_ar: nullable(formData.get('name_ar')),
    branch_id: nullable(formData.get('branch_id')),
    manager_id: nullable(formData.get('manager_id')),
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
  };

  const supabase = await createClient();
  const { error: dbErr } = id
    ? await supabase.from('erp_departments').update(payload).eq('id', id)
    : await supabase.from('erp_departments').insert(payload);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: id ? 'update' : 'create', entity: 'department', entityId: id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}

export async function toggleDepartmentActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_departments').update({ is_active: isActive }).eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: isActive ? 'enable' : 'disable', entity: 'department', entityId: id, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function upsertTeam(formData: FormData): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const id = nullable(formData.get('id'));
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const payload = {
    name,
    name_ar: nullable(formData.get('name_ar')),
    department_id: nullable(formData.get('department_id')),
    lead_id: nullable(formData.get('lead_id')),
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
  };

  const supabase = await createClient();
  const { error: dbErr } = id
    ? await supabase.from('erp_teams').update(payload).eq('id', id)
    : await supabase.from('erp_teams').insert(payload);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: id ? 'update' : 'create', entity: 'team', entityId: id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}

export async function toggleTeamActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_teams').update({ is_active: isActive }).eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: isActive ? 'enable' : 'disable', entity: 'team', entityId: id, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}

// ── Job titles ──────────────────────────────────────────────────────────────

export async function upsertJobTitle(formData: FormData): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const id = nullable(formData.get('id'));
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const payload = {
    name,
    name_ar: nullable(formData.get('name_ar')),
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
  };

  const supabase = await createClient();
  const { error: dbErr } = id
    ? await supabase.from('erp_job_titles').update(payload).eq('id', id)
    : await supabase.from('erp_job_titles').insert(payload);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: id ? 'update' : 'create', entity: 'job_title', entityId: id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}

export async function toggleJobTitleActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_job_titles').update({ is_active: isActive }).eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: isActive ? 'enable' : 'disable', entity: 'job_title', entityId: id, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}

// ── Employee assignment ─────────────────────────────────────────────────────
// Updates the membership row (erp_user_branches) for a given assignment id:
// department / team / job title and the reporting line (reports_to = another
// member's user_id). RLS restricts the update to the caller's own branches.

export async function assignEmployee(
  membershipId: string,
  values: {
    department_id: string | null;
    team_id: string | null;
    job_title_id: string | null;
    reports_to: string | null;
  },
): Promise<ActionResult> {
  const { ctx, error } = await guard();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase
    .from('erp_user_branches')
    .update({
      department_id: values.department_id,
      team_id: values.team_id,
      job_title_id: values.job_title_id,
      reports_to: values.reports_to,
    })
    .eq('id', membershipId);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAudit(supabase, { action: 'update', entity: 'assignment', entityId: membershipId, details: values, companyId: ctx.companyId });
  revalidatePath('/settings/organization');
  return { ok: true };
}
