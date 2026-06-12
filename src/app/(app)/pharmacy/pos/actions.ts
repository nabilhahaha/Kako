'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';
import { loadProductUnitsMany } from '@/lib/erp/uom-server';
import { validateSell, validateQty, baseMovement } from '@/lib/erp/uom-rules';
import { toBase, priceToBase, factorOf } from '@/lib/erp/uom';
import { quickSale } from '../../sales/pos/actions';
import { computeTotals } from '@/lib/erp/sales-calc';
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
  is_controlled: boolean;
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

export interface PharmacyLoyaltyInfo {
  points: number;
  earn_rate: number;
  redeem_rate: number;   // EGP value per point
  min_redeem: number;
}

/** A customer's loyalty balance + the tenant rates, for the POS redeem UI. */
export async function pharmacyLoyaltyInfo(customerId: string): Promise<PharmacyLoyaltyInfo | null> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx?.companyId || !customerId) return null;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.loyalty'] !== true) return null;
  const [{ data: cust }, { data: ls }] = await Promise.all([
    supabase.from('erp_customers').select('loyalty_points').eq('id', customerId).eq('company_id', ctx.companyId).maybeSingle(),
    supabase.from('erp_loyalty_settings').select('earn_rate, redeem_rate, min_redeem').eq('company_id', ctx.companyId).maybeSingle(),
  ]);
  const s = ls as { earn_rate: number; redeem_rate: number; min_redeem: number } | null;
  return {
    points: Number((cust as { loyalty_points: number } | null)?.loyalty_points ?? 0),
    earn_rate: Number(s?.earn_rate ?? 0),
    redeem_rate: Number(s?.redeem_rate ?? 0),
    min_redeem: Number(s?.min_redeem ?? 0),
  };
}

export interface PharmacyAlternative extends PharmacySearchRow {
  manufacturer: string | null;
  form: string | null;
  strength: string | null;
}

/** Generic/substitute medicines (same active ingredient; same dosage form first,
 *  in-stock, cheapest). Returns trade name + manufacturer + form + strength +
 *  price + on-hand for the POS "Find Alternatives" dialog. */
export async function pharmacyAlternatives(productId: string): Promise<PharmacyAlternative[]> {
  const { error } = await requireAuth();
  if (error || !productId) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_alternatives', { p_product: productId, p_limit: 12 });
  return ((data ?? []) as Array<Omit<PharmacyAlternative, 'tax_rate' | 'batch_count' | 'is_controlled'>>).
    map((r) => ({ ...r, tax_rate: 0, batch_count: 0, is_controlled: false }));
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

export interface PharmacyPrescription {
  patient_name?: string | null;
  patient_phone?: string | null;
  doctor_name?: string | null;
  rx_number?: string | null;
  is_controlled?: boolean;
}

export async function pharmacyCheckout(input: {
  branch_id: string;
  customer_id: string;
  lines: PharmacyCheckoutLine[];
  amount: number;
  payment_method: PaymentMethod;
  /** Prescription → Dispense linkage: when provided and the tenant has
   *  prescription capture enabled, an audited dispense register record is written
   *  and linked to the created invoice (regulatory log; does not move stock). */
  prescription?: PharmacyPrescription | null;
  /** Offline POS replay dedup key (client-generated UUID). If a sale with this
   *  key was already committed, the stored invoice is returned instead of
   *  creating a second one — so a lost response never double-charges. */
  idempotency_key?: string | null;
  /** Loyalty points to redeem on this sale (the client has already applied the
   *  redemption as a cart discount, so `amount`/net are post-redemption). */
  redeem_points?: number | null;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!input.lines?.length) return { ok: false, error: 'empty_cart' };

  const supabase = await createClient();

  // Idempotent replay: a previously-committed sale with this key returns its
  // invoice (no second sale). The unique (company_id, key) index is the guard.
  const idemKey = (input.idempotency_key ?? '').trim() || null;
  if (idemKey) {
    const { data: prior } = await supabase
      .from('erp_pharmacy_pos_idempotency')
      .select('invoice_id, invoice_number').eq('idempotency_key', idemKey).maybeSingle();
    const p = prior as { invoice_id: string | null; invoice_number: string | null } | null;
    if (p?.invoice_id) return { ok: true, data: { invoice_id: p.invoice_id, invoice_number: p.invoice_number ?? '' } };
  }

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

  // Partial payment / customer credit: `amount` is what's paid NOW; any shortfall
  // against the invoice net becomes the customer's account balance (AR). Gated by
  // pharmacy.customer_credit and the customer's own credit control / limit.
  const net = computeTotals(saleLines).net_amount;
  const paidNow = Math.min(Math.max(0, input.amount), net);
  const remainder = Math.round((net - paidNow) * 100) / 100;
  if (remainder > 0.005) {
    if (flags['pharmacy.customer_credit'] !== true) return { ok: false, error: 'credit_disabled' };
    const { data: cust } = await supabase
      .from('erp_customers').select('balance, credit_limit, credit_control_enabled')
      .eq('id', input.customer_id).eq('company_id', ctx.companyId).maybeSingle();
    const c = cust as { balance: number; credit_limit: number; credit_control_enabled: boolean } | null;
    if (c?.credit_control_enabled && Number(c.credit_limit) > 0
        && Number(c.balance) + remainder > Number(c.credit_limit)) {
      return { ok: false, error: 'credit_limit' };
    }
  }

  const sale = await quickSale({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    lines: saleLines,
    pay: paidNow > 0,
    amount: paidNow,
    payment_method: input.payment_method,
  });
  if (!sale.ok || !sale.data) return { ok: false, error: sale.error };

  // Record the idempotency key so a replay of this exact sale is a no-op. Best-
  // effort; a unique-violation here means a concurrent replay already recorded it.
  if (idemKey) {
    await supabase.from('erp_pharmacy_pos_idempotency').insert({
      company_id: ctx.companyId, idempotency_key: idemKey,
      invoice_id: sale.data.invoice_id, invoice_number: sale.data.invoice_number, created_by: ctx.userId,
    });
  }

  if (multiUnit && movements.some((m) => m.entered_unit !== '' && m.factor !== 1)) {
    await logAudit(supabase, {
      action: 'create', entity: 'uom_movement', entityId: sale.data.invoice_id,
      details: { movements }, companyId: ctx.companyId,
    });
  }

  // The earliest batch touched per product (for the dispense register's batch
  // traceability column). Filled by the batch-tracking decrement below.
  const batchByProduct = new Map<string, { batch_number: string | null; expiry_date: string | null }>();

  // Batch Tracking ON → decrement stock at the batch level. With FEFO enabled,
  // allocation is SERVER-authoritative: erp_pick_fefo_batches picks from the
  // earliest-expiry batches (correct even across multiple batches); otherwise the
  // cashier-chosen batch is used. Best-effort (the sale is already committed).
  if (flags['pharmacy.batch_tracking']) {
    const fefo = flags['pharmacy.fefo_allocation'] === true;
    for (const l of input.lines) {
      const cfg = cfgByProduct.get(l.product_id);
      const baseQty = (multiUnit && l.uom && cfg) ? toBase(l.quantity, factorOf(cfg.units, l.uom)) : l.quantity;
      if (!(baseQty > 0)) continue;
      if (fefo) {
        const { data: picks } = await supabase.rpc('erp_pick_fefo_batches', {
          p_product: l.product_id, p_warehouse: null, p_qty: baseQty,
        });
        for (const p of (picks ?? []) as Array<{ batch_id: string; take: number }>) {
          const { data: b } = await supabase.from('erp_product_batches').select('qty_on_hand, batch_number, expiry_date').eq('id', p.batch_id).maybeSingle();
          const row = b as { qty_on_hand: number; batch_number: string | null; expiry_date: string | null } | null;
          const cur = Number(row?.qty_on_hand ?? 0);
          if (!batchByProduct.has(l.product_id)) batchByProduct.set(l.product_id, { batch_number: row?.batch_number ?? null, expiry_date: row?.expiry_date ?? null });
          await supabase.from('erp_product_batches')
            .update({ qty_on_hand: Math.max(0, cur - Number(p.take)), updated_at: new Date().toISOString() })
            .eq('id', p.batch_id);
        }
      } else if (l.batch_id) {
        const { data: b } = await supabase.from('erp_product_batches').select('qty_on_hand, batch_number, expiry_date').eq('id', l.batch_id).maybeSingle();
        const row = b as { qty_on_hand: number; batch_number: string | null; expiry_date: string | null } | null;
        const cur = Number(row?.qty_on_hand ?? 0);
        if (!batchByProduct.has(l.product_id)) batchByProduct.set(l.product_id, { batch_number: row?.batch_number ?? null, expiry_date: row?.expiry_date ?? null });
        await supabase.from('erp_product_batches')
          .update({ qty_on_hand: Math.max(0, cur - baseQty), updated_at: new Date().toISOString() })
          .eq('id', l.batch_id);
      }
    }
  }

  // Prescription → Dispense linkage + Controlled Drug Register enforcement.
  // Fetch product names + controlled flags for the sold lines once.
  const { data: prodMeta } = await supabase
    .from('erp_products_catalog').select('id, name, name_ar, is_controlled')
    .in('id', input.lines.map((l) => l.product_id));
  const metaById = new Map((((prodMeta ?? []) as Array<{ id: string; name: string; name_ar: string | null; is_controlled: boolean }>))
    .map((n) => [n.id, n]));
  const nameById = new Map([...metaById].map(([id, m]) => [id, m.name_ar || m.name]));
  const controlledTracking = flags['pharmacy.controlled_drug_tracking'] === true;
  const hasControlled = controlledTracking && input.lines.some((l) => metaById.get(l.product_id)?.is_controlled === true);

  const rx = input.prescription ?? null;
  const rxHasData = !!rx && !!(rx.patient_name?.trim() || rx.doctor_name?.trim() || rx.rx_number?.trim() || rx.is_controlled);

  // Controlled enforcement: a controlled sale MUST carry patient + Rx number and
  // is always written to the register, regardless of the capture flag. The sale is
  // already committed, so we still record it but report the compliance gap.
  let controlledIncomplete = false;
  if (hasControlled && !(rx?.patient_name?.trim() && rx?.rx_number?.trim())) {
    controlledIncomplete = true;
  }

  const writeRegister =
    (flags['pharmacy.prescription_capture'] === true && (rxHasData || flags['pharmacy.pos_prescription_required'] === true))
    || hasControlled;

  if (writeRegister) {
    const { data: disp } = await supabase
      .from('erp_pharmacy_dispenses')
      .insert({
        company_id: ctx.companyId, branch_id: input.branch_id, status: 'done',
        patient_name: rx?.patient_name?.trim() || null, patient_phone: rx?.patient_phone?.trim() || null,
        doctor_name: rx?.doctor_name?.trim() || null, rx_number: rx?.rx_number?.trim() || null,
        is_controlled: hasControlled || rx?.is_controlled === true,
        invoice_no: sale.data.invoice_number, created_by: ctx.userId,
        notes: controlledIncomplete ? 'controlled: missing prescription data' : null,
      })
      .select('id').maybeSingle();
    const dispId = (disp as { id: string } | null)?.id ?? null;
    if (dispId) {
      const itemRows = input.lines.map((l) => {
        const bt = batchByProduct.get(l.product_id);
        return {
          company_id: ctx.companyId, dispense_id: dispId, product_id: l.product_id,
          name: nameById.get(l.product_id) ?? l.product_id, qty: l.quantity, price: l.unit_price,
          batch_number: bt?.batch_number ?? null, expiry_date: bt?.expiry_date ?? null,
        };
      });
      await supabase.from('erp_pharmacy_dispense_items').insert(itemRows);
      await logAudit(supabase, {
        action: 'create', entity: 'pharmacy_dispense', entityId: dispId,
        details: {
          invoice_no: sale.data.invoice_number, rx_number: rx?.rx_number ?? null,
          is_controlled: hasControlled || rx?.is_controlled === true,
          controlled_incomplete: controlledIncomplete, items: itemRows.length,
        },
        companyId: ctx.companyId,
      });
    }
  }

  // Loyalty: earn points on the (post-redemption) net and redeem the requested
  // points. The client already applied the redemption as a cart discount, so net
  // is correct. Atomic via erp_loyalty_redeem_earn; best-effort (sale committed).
  if (flags['pharmacy.loyalty'] === true) {
    const { data: ls } = await supabase
      .from('erp_loyalty_settings').select('earn_rate').eq('company_id', ctx.companyId).maybeSingle();
    const earnRate = Number((ls as { earn_rate: number } | null)?.earn_rate ?? 0);
    const redeem = Math.max(0, Math.floor(Number(input.redeem_points ?? 0)));
    const earn = earnRate > 0 ? Math.floor(net * earnRate) : 0;
    if ((earn > 0 || redeem > 0) && input.customer_id) {
      const { error: lErr } = await supabase.rpc('erp_loyalty_redeem_earn', {
        p_customer: input.customer_id, p_invoice_no: sale.data.invoice_number,
        p_redeem: redeem, p_earn: earn,
      });
      if (!lErr) {
        await logAudit(supabase, {
          action: 'create', entity: 'loyalty', entityId: input.customer_id,
          details: { invoice_no: sale.data.invoice_number, earn, redeem }, companyId: ctx.companyId,
        });
      }
    }
  }

  return { ok: true, data: sale.data };
}
