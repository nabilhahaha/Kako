'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Company-admin org-structure management. Generic departments / teams / job
// titles + per-employee assignment & reporting lines. Company scope is enforced
// by RLS (writes require branch role 'admin'); company_id is auto-stamped on
// insert by a trigger, so we omit it. Each action re-checks admin in app code
// as a fast fail before hitting the DB.

function nullable(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

// ── Departments ─────────────────────────────────────────────────────────────

export async function upsertDepartment(formData: FormData): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

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
  const { error } = id
    ? await supabase.from('erp_departments').update(payload).eq('id', id)
    : await supabase.from('erp_departments').insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}

export async function toggleDepartmentActive(id: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_departments').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function upsertTeam(formData: FormData): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

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
  const { error } = id
    ? await supabase.from('erp_teams').update(payload).eq('id', id)
    : await supabase.from('erp_teams').insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}

export async function toggleTeamActive(id: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_teams').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}

// ── Job titles ──────────────────────────────────────────────────────────────

export async function upsertJobTitle(formData: FormData): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

  const id = nullable(formData.get('id'));
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const payload = {
    name,
    name_ar: nullable(formData.get('name_ar')),
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_job_titles').update(payload).eq('id', id)
    : await supabase.from('erp_job_titles').insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}

export async function toggleJobTitleActive(id: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_job_titles').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}

// ── Employee assignment ─────────────────────────────────────────────────────
// Updates the membership row (erp_user_branches) for a given assignment id:
// department / team / job title and the reporting line (reports_to = another
// member's user_id). All links are independent (matrix reporting is allowed).

export async function assignEmployee(
  membershipId: string,
  values: {
    department_id: string | null;
    team_id: string | null;
    job_title_id: string | null;
    reports_to: string | null;
  },
): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.memberships.some((m) => m.role === 'admin')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_user_branches')
    .update({
      department_id: values.department_id,
      team_id: values.team_id,
      job_title_id: values.job_title_id,
      reports_to: values.reports_to,
    })
    .eq('id', membershipId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/organization');
  return { ok: true };
}
