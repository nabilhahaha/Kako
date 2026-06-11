'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';

/**
 * Pharmacy Catalog Onboarding — build tenant inventory FROM the Global Medicine
 * Catalog (erp_clinic_reference kind='drug', 24.9k Egyptian drugs). Reuse, not
 * re-enter: the owner searches the shared catalog and adds medicines as tenant
 * products linked via medicine_ref_id, with price/unit/min-stock. Excel import
 * and mixed mode reuse the existing product import engine.
 */

export interface GlobalDrug {
  id: string;
  name: string;
  name_ar: string | null;
  active_ingredient: string | null;
  manufacturer: string | null;
  form: string | null;
  category: string | null;
  barcode: string | null;
  price: number | null;
}

export async function searchGlobalCatalog(query: string): Promise<GlobalDrug[]> {
  const { error } = await requireAuth();
  if (error) return [];
  const q = (query ?? '').replace(/[,()%*]/g, ' ').trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const like = `%${q}%`;
  const { data } = await supabase
    .from('erp_clinic_reference')
    .select('id, name, name_ar, active_ingredient, manufacturer, form, category, barcode, price')
    .eq('kind', 'drug').eq('is_active', true)
    .or(`name.ilike.${like},name_ar.ilike.${like},active_ingredient.ilike.${like}`)
    .limit(25);
  return (data as GlobalDrug[]) ?? [];
}

export interface OnboardItem {
  ref_id: string;
  name: string;
  name_ar?: string | null;
  active_ingredient?: string | null;
  barcode?: string | null;
  sell_price: number;
  cost_price?: number;
  min_stock?: number;
  base_uom: string;
}

export async function onboardMedicines(items: OnboardItem[]): Promise<ActionResult & { count?: number }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  const perms = ctx.permissions as string[];
  if (!(perms.includes('inventory.adjust') || perms.includes('pricing.manage') || ctx.isSuperAdmin)) {
    return { ok: false, error: 'no_permission' };
  }
  if (!items?.length) return { ok: false, error: 'no_items' };

  const stamp = Date.now().toString(36).toUpperCase();
  const rows = items.slice(0, 300).map((d, i) => ({
    company_id: ctx.companyId,
    code: `RX${stamp}${i}`,
    name: (d.name || '').slice(0, 200),
    name_ar: d.name_ar || null,
    description: d.active_ingredient || null,
    barcode: d.barcode || null,
    sell_price: Number(d.sell_price) || 0,
    cost_price: Number(d.cost_price) || 0,
    min_stock: Number(d.min_stock) || 0,
    unit: d.base_uom || 'unit',
    base_uom: d.base_uom || 'unit',
    is_active: true,
    is_medicine: true,
    medicine_ref_id: d.ref_id,
    created_source: 'onboarding',
  }));

  const supabase = await createClient();
  const { error: insErr } = await supabase.from('erp_products_catalog').insert(rows);
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };
  await logAudit(supabase, {
    action: 'create', entity: 'medicine_onboarding',
    details: { count: rows.length }, companyId: ctx.companyId,
  });
  revalidatePath('/pharmacy/onboarding');
  revalidatePath('/products');
  return { ok: true, count: rows.length };
}
