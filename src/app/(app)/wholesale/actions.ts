'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

const NO_COMPANY = 'هذه العملية تتم من داخل حساب الشركة.';

export async function upsertTier(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'اسم المستوى مطلوب.' };
  const sort = Number(formData.get('sort') || 0);
  const row = { name, sort: Number.isFinite(sort) ? Math.round(sort) : 0, is_active: String(formData.get('is_active') || 'true') !== 'false' };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_wholesale_tiers').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_wholesale_tiers').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/wholesale');
  return { ok: true };
}

export async function setPrice(tierId: string, productId: string, price: number): Promise<ActionResult> {
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'سعر غير صحيح.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_wholesale_prices')
    .upsert({ company_id: ctx.companyId, tier_id: tierId, product_id: productId, price }, { onConflict: 'tier_id,product_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/wholesale/prices');
  return { ok: true };
}

export async function setCustomerTier(customerId: string, tierId: string | null): Promise<ActionResult> {
  const ctx = await requirePermission('wholesale.pricing');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_wholesale_customer_tier')
    .upsert({ customer_id: customerId, company_id: ctx.companyId, tier_id: tierId || null, updated_at: new Date().toISOString() }, { onConflict: 'customer_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/wholesale/customers');
  return { ok: true };
}
