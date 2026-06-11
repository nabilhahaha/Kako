'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';
import { loadProductUnitsMany } from '@/lib/erp/uom-server';
import { validateSell, validateQty, baseMovement } from '@/lib/erp/uom-rules';
import { toBase, priceToBase, factorOf } from '@/lib/erp/uom';
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
  if (!(perms.includes('inventory.adjust') || perms.includes('pricing.manage') || ctx.isSuperAdmin)) {
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
  /** Selling unit; defaults to the product's base unit. */
  uom?: string | null;
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

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  const multiUnit = flags['pharmacy.multi_unit_support'] === true;

  // Unit governance: validate each line and store stock in BASE units. The entered
  // unit / entered qty / base qty are preserved for the audit trail. Without
  // multi-unit, lines are already base-unit; we still enforce whole-quantity rules.
  const cfgByProduct = await loadProductUnitsMany(supabase, input.lines.map((l) => l.product_id));
  const movements: ReturnType<typeof baseMovement>[] = [];
  const saleLines = [] as Array<{ product_id: string; quantity: number; unit_price: number; discount_pct: number; tax_rate: number }>;
  for (const l of input.lines) {
    const cfg = cfgByProduct.get(l.product_id);
    const uom = (multiUnit && l.uom) ? l.uom : (cfg?.units.base ?? '');
    let quantity = l.quantity;
    let unitPrice = l.unit_price;
    if (cfg) {
      const v = (multiUnit && l.uom) ? validateSell(l.quantity, uom, cfg.units, cfg.rules)
                                     : validateQty(l.quantity, cfg.units.base, cfg.units, cfg.rules);
      if (!v.ok) return { ok: false, error: `uom_${v.error}` };
      if (multiUnit && l.uom && uom !== cfg.units.base) {
        const f = factorOf(cfg.units, uom);
        quantity = toBase(l.quantity, f);     // stock decrements in base units
        unitPrice = priceToBase(l.unit_price, f);
      }
      movements.push(baseMovement(l.quantity, uom, cfg.units));
    }
    saleLines.push({
      product_id: l.product_id, quantity, unit_price: unitPrice,
      discount_pct: l.discount_pct ?? 0, tax_rate: l.tax_rate ?? 0,
    });
  }

  const sale = await quickSale({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    lines: saleLines,
    pay: true,
    amount: input.amount,
    payment_method: input.payment_method,
  });
  if (!sale.ok || !sale.data) return { ok: false, error: sale.error };

  if (multiUnit && movements.some((m) => m.entered_unit !== '' && m.factor !== 1)) {
    await logAudit(supabase, {
      action: 'create', entity: 'uom_movement', entityId: sale.data.invoice_id,
      details: { movements }, companyId: ctx.companyId,
    });
  }

  // Batch Tracking ON → decrement the chosen batches (best-effort; the sale is
  // already committed). FEFO/manual selection is decided on the client.
  if (flags['pharmacy.batch_tracking']) {
    for (const l of input.lines) {
      if (!l.batch_id) continue;
      const cfg = cfgByProduct.get(l.product_id);
      const baseQty = (multiUnit && l.uom && cfg) ? toBase(l.quantity, factorOf(cfg.units, l.uom)) : l.quantity;
      const { data: b } = await supabase
        .from('erp_product_batches').select('qty_on_hand').eq('id', l.batch_id).maybeSingle();
      const cur = Number((b as { qty_on_hand: number } | null)?.qty_on_hand ?? 0);
      await supabase.from('erp_product_batches')
        .update({ qty_on_hand: Math.max(0, cur - baseQty), updated_at: new Date().toISOString() })
        .eq('id', l.batch_id);
    }
  }

  return { ok: true, data: sale.data };
}
