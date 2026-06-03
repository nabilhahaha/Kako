'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, can, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { resolvePrice } from '@/lib/erp/pricing-server';

/** Pricing management (P-b). Rule/list CRUD gated by pricing.manage; the line
 *  resolver is available to any authenticated seller. Tenant-scoped via RLS. */

async function guard(): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  // authz P2: alias-covered granular capability (pricing.manage → pricing.rule.edit).
  if (!ctx.companyId || !can(ctx, 'pricing.rule.edit')) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId };
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Resolve the engine price for a line (used by the order/invoice editor). Any
 *  authenticated seller — no pricing.manage required. Returns null on no match. */
export async function resolveLinePrice(args: {
  productId: string; customerId: string; branchId?: string | null; qty?: number;
}): Promise<number | null> {
  const { ctx } = await requireAuth();
  if (!ctx) return null;
  if (!args.productId || !args.customerId) return null;
  const supabase = await createClient();
  const r = await resolvePrice(supabase, args);
  return r ? r.price : null;
}

export async function upsertPriceRule(formData: FormData): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const id = String(formData.get('id') || '').trim();
  const product_id = String(formData.get('product_id') || '').trim();
  const scope_type = String(formData.get('scope_type') || '').trim();
  const scope_id = String(formData.get('scope_id') || '').trim() || null;
  const price_type = String(formData.get('price_type') || '').trim();
  const value = numOrNull(formData.get('value'));
  if (!product_id) return { ok: false, error: 'product required' };
  if (value === null) return { ok: false, error: 'value required' };
  if (value < 0) return { ok: false, error: 'value must be 0 or greater' };
  if (scope_type !== 'global' && !scope_id) return { ok: false, error: 'a scope must be selected for this scope type' };
  if (price_type === 'percent_off' && value > 100) return { ok: false, error: 'percentage must be between 0 and 100' };
  const vFrom = String(formData.get('valid_from') || '').trim();
  const vTo = String(formData.get('valid_to') || '').trim();
  if (vFrom && vTo && vFrom > vTo) return { ok: false, error: 'valid-from must be on or before valid-to' };

  const payload = {
    product_id,
    scope_type,
    scope_id: scope_type === 'global' ? null : scope_id,
    price_type,
    value,
    min_qty: numOrNull(formData.get('min_qty')) ?? 1,
    priority: numOrNull(formData.get('priority')) ?? 0,
    valid_from: String(formData.get('valid_from') || '').trim() || null,
    valid_to: String(formData.get('valid_to') || '').trim() || null,
    company_id: g.companyId,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_price_rules').update(payload).eq('id', id)
    : await supabase.from('erp_price_rules').insert(payload);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/pricing');
  return { ok: true };
}

export async function togglePriceRuleActive(id: string, isActive: boolean): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_price_rules').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/pricing');
  return { ok: true };
}

export async function deletePriceRule(id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_price_rules').delete().eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/pricing');
  return { ok: true };
}

export async function upsertPriceList(formData: FormData): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  const branch_id = String(formData.get('branch_id') || '').trim() || null;
  if (!name) return { ok: false, error: 'name required' };
  const payload = { name, name_ar, branch_id };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_price_lists').update(payload).eq('id', id)
    : await supabase.from('erp_price_lists').insert(payload);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/pricing');
  return { ok: true };
}

export async function upsertPriceListItem(formData: FormData): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const price_list_id = String(formData.get('price_list_id') || '').trim();
  const product_id = String(formData.get('product_id') || '').trim();
  const unit_price = numOrNull(formData.get('unit_price'));
  if (!price_list_id || !product_id) return { ok: false, error: 'list + product required' };
  if (unit_price === null) return { ok: false, error: 'price required' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_price_list_items')
    .upsert({ price_list_id, product_id, unit_price }, { onConflict: 'price_list_id,product_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/pricing');
  return { ok: true };
}
