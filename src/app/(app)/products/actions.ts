'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export async function upsertProduct(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: 'كود المنتج مطلوب.' };
  if (!name) return { ok: false, error: 'اسم المنتج مطلوب.' };

  const categoryId = String(formData.get('category_id') || '').trim();
  const payload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    barcode: String(formData.get('barcode') || '').trim() || null,
    category_id: categoryId || null,
    unit: String(formData.get('unit') || 'piece'),
    cost_price: num(formData.get('cost_price')),
    sell_price: num(formData.get('sell_price')),
    min_stock: num(formData.get('min_stock')),
    tax_rate: num(formData.get('tax_rate')),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_products_catalog').update(payload).eq('id', id)
    : await supabase.from('erp_products_catalog').insert(payload);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/products');
  return { ok: true };
}

export async function toggleProductActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_products_catalog')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/products');
  return { ok: true };
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code || !name)
    return { ok: false, error: 'كود واسم التصنيف مطلوبان.' };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_product_categories').insert({
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/products');
  return { ok: true };
}
