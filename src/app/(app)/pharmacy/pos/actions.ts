'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';
import { quickSale } from '../../sales/pos/actions';
import type { PaymentMethod } from '@/lib/erp/types';

/**
 * Fast Pharmacy POS — server actions. Search + batch lookup feed the
 * keyboard-first terminal; checkout reuses the proven quickSale (create → issue
 * → pay → visit) and, when Batch Tracking is enabled for the tenant, decrements
 * the chosen batches. All reads are RLS-scoped; the feature gates are resolved
 * server-side so disabled behaviour never executes.
 */

export interface PharmacySearchRow {
  product_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  barcode: string | null;
  sell_price: number;
  tax_rate: number;
  active_ingredient: string | null;
  on_hand: number;
  batch_count: number;
}

export async function pharmacySearch(query: string): Promise<PharmacySearchRow[]> {
  const { error } = await requireAuth();
  if (error) return [];
  const q = (query ?? '').trim();
  if (q.length < 1) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_search', { p_query: q, p_limit: 30 });
  return (data as PharmacySearchRow[]) ?? [];
}

export interface PharmacyBatch {
  id: string;
  batch_number: string | null;
  expiry_date: string | null;
  qty_on_hand: number;
}

/** Batches for a product, earliest-expiry first (index 0 = FEFO suggestion). */
export async function pharmacyBatches(productId: string): Promise<PharmacyBatch[]> {
  const { error } = await requireAuth();
  if (error || !productId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_product_batches')
    .select('id, batch_number, expiry_date, qty_on_hand')
    .eq('product_id', productId)
    .gt('qty_on_hand', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: true });
  return (data as PharmacyBatch[]) ?? [];
}

/**
 * Scan fallback — link a scanned barcode to an existing product (the generic
 * Scanning Framework's "not found → link to record" mapping). Permission-gated
 * (products.manage / pricing.manage); company-scoped via RLS; audited.
 */
export async function linkBarcodeToProduct(productId: string, barcode: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  const perms = ctx.permissions as string[];
  if (!(perms.includes('products.manage') || perms.includes('pricing.manage') || ctx.isSuperAdmin)) {
    return { ok: false, error: 'no_permission' };
  }
  const code = (barcode ?? '').trim();
  if (!productId || !code) return { ok: false, error: 'invalid' };
  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_products_catalog')
    .update({ barcode: code, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', productId)
    .eq('company_id', ctx.companyId);
  if (upErr) return { ok: false, error: upErr.message };
  await logAudit(supabase, {
    action: 'update', entity: 'product_barcode', entityId: productId,
    details: { barcode: code }, companyId: ctx.companyId,
  });
  return { ok: true };
}

export interface PharmacyCheckoutLine {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  tax_rate?: number;
  batch_id?: string | null;
}

export async function pharmacyCheckout(input: {
  branch_id: string;
  customer_id: string;
  lines: PharmacyCheckoutLine[];
  amount: number;
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!input.lines?.length) return { ok: false, error: 'empty_cart' };

  const sale = await quickSale({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    lines: input.lines.map((l) => ({
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct ?? 0,
      tax_rate: l.tax_rate ?? 0,
    })),
    pay: true,
    amount: input.amount,
    payment_method: input.payment_method,
  });
  if (!sale.ok || !sale.data) return { ok: false, error: sale.error };

  // Batch Tracking ON → decrement the chosen batches (best-effort; the sale is
  // already committed). FEFO/manual selection is decided on the client.
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.batch_tracking']) {
    for (const l of input.lines) {
      if (!l.batch_id) continue;
      const { data: b } = await supabase
        .from('erp_product_batches').select('qty_on_hand').eq('id', l.batch_id).maybeSingle();
      const cur = Number((b as { qty_on_hand: number } | null)?.qty_on_hand ?? 0);
      await supabase.from('erp_product_batches')
        .update({ qty_on_hand: Math.max(0, cur - l.quantity), updated_at: new Date().toISOString() })
        .eq('id', l.batch_id);
    }
  }

  return { ok: true, data: sale.data };
}
