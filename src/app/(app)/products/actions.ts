'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { APPROVAL_PRICE_CHANGE_WF } from '@/lib/erp/approval-flags';
import { getT } from '@/lib/i18n/server';

/**
 * P1: request a price change through the engine (flag-gated, additive).
 * Stages the requested price in erp_price_change_requests and starts the
 * `price_change_approval` workflow (approver: any pricing.manage holder;
 * self-approval blocked, reject reason required). The live product price is
 * untouched until the request is approved, when the `price_change_request`
 * outcome handler applies it. Direct price edits (upsertProduct) are unchanged;
 * this is an additional, opt-in approval path that only exists when the flag is on.
 */
export async function requestPriceChange(
  productId: string,
  requestedPrice: number,
  reason?: string,
): Promise<ActionResult> {
  if (!APPROVAL_PRICE_CHANGE_WF()) return { ok: false, error: 'workflow_disabled' };
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'unauthorized' };
  if (!productId || !Number.isFinite(requestedPrice) || requestedPrice < 0) {
    return { ok: false, error: 'invalid' };
  }

  const supabase = await createClient();
  const { data: req, error: insErr } = await supabase
    .from('erp_price_change_requests')
    .insert({
      company_id: ctx.companyId,
      product_id: productId,
      requested_price: requestedPrice,
      status: 'submitted',
      requested_by: ctx.userId,
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };
  const reqId = (req as { id: string }).id;

  const { error: startErr } = await supabase.rpc('erp_workflow_start', {
    p_key: 'price_change_approval', p_entity: 'price_change_request',
    p_record_id: reqId, p_context: { amount: requestedPrice },
  });
  if (startErr) return { ok: false, error: friendlyDbError(startErr) };

  await logAudit(supabase, {
    action: 'request', entity: 'price_change_request', entityId: reqId,
    details: { product_id: productId, requested_price: requestedPrice, reason: reason?.trim() || null },
    companyId: ctx.companyId,
  });
  revalidatePath('/approvals');
  return { ok: true };
}

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Bulk-add drugs picked from the Egyptian drug reference into this company's
 *  product catalog (market price → suggested sell price). Codes are generated. */
export async function addDrugsToProducts(
  items: { name: string; name_ar?: string | null; detail?: string | null; price?: number | null }[],
): Promise<ActionResult & { count?: number }> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!items?.length) return { ok: false, error: t('products.errorNoItems') };

  const supabase = await createClient();
  const stamp = Date.now().toString(36).toUpperCase();
  const rows = items.slice(0, 200).map((d, i) => ({
    code: `RX${stamp}${i}`,
    name: (d.name || '').slice(0, 200),
    name_ar: d.name_ar || null,
    description: d.detail || null,
    sell_price: d.price ?? 0,
    unit: 'علبة',
    is_active: true,
  }));

  const { error } = await supabase.from('erp_products_catalog').insert(rows);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/products');
  return { ok: true, count: rows.length };
}

export async function upsertProduct(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();

  const id = String(formData.get('id') || '').trim();
  let code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('products.errorNameRequired') };

  const supabase = await createClient();
  // Auto-generate a sequential code (P00001, P00002, …) when left blank.
  if (!code) code = await nextProductCode(supabase);

  // U-4: price is a sensitive field. Only a user with pricing authority may set or
  // change it; otherwise preserve the existing prices (edit) or default to 0
  // (create). Non-price product fields remain editable by any product editor.
  const canPrice = hasPermission(ctx, 'pricing.manage') || hasPermission(ctx, 'product.create');
  let costPrice = num(formData.get('cost_price'));
  let sellPrice = num(formData.get('sell_price'));
  if (!canPrice) {
    if (id) {
      const { data: ex } = await supabase
        .from('erp_products_catalog').select('cost_price, sell_price').eq('id', id).maybeSingle();
      const e = ex as { cost_price?: number; sell_price?: number } | null;
      costPrice = Number(e?.cost_price ?? 0);
      sellPrice = Number(e?.sell_price ?? 0);
    } else {
      costPrice = 0;
      sellPrice = 0;
    }
  }

  const categoryId = String(formData.get('category_id') || '').trim();
  const payload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    barcode: String(formData.get('barcode') || '').trim() || null,
    category_id: categoryId || null,
    unit: String(formData.get('unit') || 'piece'),
    cost_price: costPrice,
    sell_price: sellPrice,
    min_stock: num(formData.get('min_stock')),
    tax_rate: num(formData.get('tax_rate')),
    eta_item_code: String(formData.get('eta_item_code') || '').trim() || null,
    eta_item_code_type: String(formData.get('eta_item_code_type') || '').trim() || null,
    eta_unit_type: String(formData.get('eta_unit_type') || '').trim() || null,
  };

  const { error } = id
    ? await supabase.from('erp_products_catalog').update(payload).eq('id', id)
    : await supabase.from('erp_products_catalog').insert(payload);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/products');
  return { ok: true };
}

/** Next sequential product code (P00001 …), scoped by RLS to the company. */
async function nextProductCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { data } = await supabase
    .from('erp_products_catalog')
    .select('code')
    .like('code', 'P_____')
    .order('code', { ascending: false })
    .limit(1);
  const last = (data?.[0]?.code as string | undefined) ?? '';
  const n = /^P\d{5}$/.test(last) ? parseInt(last.slice(1), 10) : 0;
  return 'P' + String(n + 1).padStart(5, '0');
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
  const { t } = await getT();

  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code || !name)
    return { ok: false, error: t('products.errorCategoryRequired') };

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
