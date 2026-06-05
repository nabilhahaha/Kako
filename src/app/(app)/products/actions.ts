'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, canAny, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

/** Who may create/edit products — the product-manage capability across the
 *  generic Inventory module and the Fashion store pack. */
const PRODUCT_MANAGE = ['product.create', 'fashion.inventory', 'inventory.adjust'];

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
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  // Protect product master data — only inventory/fashion product managers may edit.
  if (!canAny(ctx!, PRODUCT_MANAGE)) return { ok: false, error: t('products.errorNoPermission') };

  const id = String(formData.get('id') || '').trim();
  let code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('products.errorNameRequired') };

  const supabase = await createClient();
  // Auto-generate a sequential code (P00001, P00002, …) when left blank.
  if (!code) code = await nextProductCode(supabase);
  const barcode = String(formData.get('barcode') || '').trim() || null;

  // SKU + barcode uniqueness (RLS scopes the check to the company). Exclude self
  // on edit. A duplicate barcode would break POS scan resolution.
  const dupCode = supabase.from('erp_products_catalog').select('id').eq('code', code).limit(1);
  if (id) dupCode.neq('id', id);
  const { data: codeHit } = await dupCode;
  if (codeHit && codeHit.length > 0) return { ok: false, error: t('products.errorCodeTaken') };
  if (barcode) {
    const dupBc = supabase.from('erp_products_catalog').select('id').eq('barcode', barcode).limit(1);
    if (id) dupBc.neq('id', id);
    const { data: bcHit } = await dupBc;
    if (bcHit && bcHit.length > 0) return { ok: false, error: t('products.errorBarcodeTaken') };
  }

  const categoryId = String(formData.get('category_id') || '').trim();
  const payload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    barcode,
    category_id: categoryId || null,
    unit: String(formData.get('unit') || 'piece'),
    cost_price: num(formData.get('cost_price')),
    sell_price: num(formData.get('sell_price')),
    min_stock: num(formData.get('min_stock')),
    tax_rate: num(formData.get('tax_rate')),
    eta_item_code: String(formData.get('eta_item_code') || '').trim() || null,
    eta_item_code_type: String(formData.get('eta_item_code_type') || '').trim() || null,
    eta_unit_type: String(formData.get('eta_unit_type') || '').trim() || null,
  };

  const { data: saved, error } = id
    ? await supabase.from('erp_products_catalog').update(payload).eq('id', id).select('id').maybeSingle()
    : await supabase.from('erp_products_catalog').insert(payload).select('id').maybeSingle();

  if (error) return { ok: false, error: friendlyDbError(error) };

  // Audit every edit. Historical invoice lines are NOT touched — they snapshot
  // price/qty at sale time — so a price/cost/code change never alters past invoices.
  await logAudit(supabase, {
    action: id ? 'product.updated' : 'product.created',
    entity: 'erp_products_catalog',
    entityId: (saved as { id?: string } | null)?.id ?? id ?? null,
    details: { code, name, barcode, cost_price: payload.cost_price, sell_price: payload.sell_price, category_id: payload.category_id },
    companyId: ctx!.companyId,
  });

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
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!canAny(ctx!, PRODUCT_MANAGE)) return { ok: false, error: t('products.errorNoPermission') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_products_catalog')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  // Deactivating a product hides it from new sales but keeps it on historical
  // invoices (which reference it by id) — non-destructive + reversible (re-activate).
  await logAudit(supabase, {
    action: isActive ? 'product.activated' : 'product.deactivated',
    entity: 'erp_products_catalog',
    entityId: id,
    companyId: ctx!.companyId,
  });
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
