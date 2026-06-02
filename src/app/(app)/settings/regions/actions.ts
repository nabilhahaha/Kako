'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';

/** Regions & Areas management (FMCG hierarchy S1). Gated by settings.branches —
 *  org-structure management. Tenant-scoped via RLS (company_id auto-set). S1 is
 *  entity CRUD only; hierarchy ownership/scope is enforced in S4. */

async function guard(): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !hasPermission(ctx, 'settings.branches')) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId };
}

export async function upsertRegion(formData: FormData): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  if (!name) return { ok: false, error: 'name required' };

  const supabase = await createClient();
  const payload = { name, name_ar, company_id: g.companyId };
  const { error } = id
    ? await supabase.from('erp_regions').update(payload).eq('id', id)
    : await supabase.from('erp_regions').insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/regions');
  return { ok: true };
}

export async function upsertArea(formData: FormData): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  const region_id = String(formData.get('region_id') || '').trim() || null;
  if (!name) return { ok: false, error: 'name required' };

  const supabase = await createClient();
  const payload = { name, name_ar, region_id, company_id: g.companyId };
  const { error } = id
    ? await supabase.from('erp_areas').update(payload).eq('id', id)
    : await supabase.from('erp_areas').insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/regions');
  return { ok: true };
}

export async function toggleRegionActive(id: string, isActive: boolean): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_regions').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/regions');
  return { ok: true };
}

export async function toggleAreaActive(id: string, isActive: boolean): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_areas').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/regions');
  return { ok: true };
}
