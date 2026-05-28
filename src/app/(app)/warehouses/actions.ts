'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

export async function upsertWarehouse(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const id = String(formData.get('id') || '').trim();
  const branch_id = String(formData.get('branch_id') || '').trim();
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const name = String(formData.get('name') || '').trim();
  if (!branch_id) return { ok: false, error: 'الفرع مطلوب.' };
  if (!code) return { ok: false, error: 'كود المخزن مطلوب.' };
  if (!name) return { ok: false, error: 'اسم المخزن مطلوب.' };

  const isVan = String(formData.get('is_van') || '') === 'on';
  const assignedTo = String(formData.get('assigned_to') || '').trim();
  const payload = {
    branch_id,
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    location: String(formData.get('location') || '').trim() || null,
    is_van: isVan,
    assigned_to: isVan && assignedTo ? assignedTo : null,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_warehouses').update(payload).eq('id', id)
    : await supabase.from('erp_warehouses').insert(payload);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/warehouses');
  return { ok: true };
}

export async function toggleWarehouseActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_warehouses')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/warehouses');
  return { ok: true };
}
