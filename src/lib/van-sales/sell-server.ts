'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive, loadVanSalesSettings } from './settings-server';
import { computeVanSellTotals, normalizeVanSellLines, firstDiscountOverCap, type VanSellLineInput } from './sell';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { multiUomEnabled, factorOf } from '@/lib/erp/uom';
import { loadProductUnitsMany } from '@/lib/erp/uom-server';
import type { DocumentTotals } from '@/lib/erp/sales-calc';

// ============================================================================
// Van Sell — thin server wrapper (Phase 1, no UI). Validates the request, then
// delegates the WHOLE sale to the erp_van_sell RPC, which is the sole authority
// (server-side pricing, van-required, discount cap, credit limit, negative-stock
// guard, idempotency — all atomic). The wrapper only adds: the enablement gate,
// fast friendly validation, the domain event, and cache revalidation. It never
// computes or passes a price.
// ============================================================================

export interface VanSellInput {
  branch_id: string;
  customer_id: string;
  lines: VanSellLineInput[];
  idempotency_key?: string;
  due_date?: string;
  notes?: string;
}

// Stable RPC error tokens → readable messages. (UI-facing i18n keys are added in
// Phase 2 with the mobile screen; this seam has no UI yet.)
const RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  branch_not_found: 'Branch not found.',
  customer_not_found: 'Customer not found.',
  customer_not_approved: 'This customer is awaiting approval.',
  no_van_assigned: 'No van is assigned to you in this branch — a van sale must come from your van.',
  discount_exceeds_cap: 'A line discount exceeds the allowed cap.',
  over_credit: 'This sale would exceed the customer credit limit.',
  insufficient_van_stock: 'Not enough stock on the van for one or more lines.',
  no_valid_lines: 'Add at least one line with a quantity.',
};

export interface VanSellPreviewLine {
  product_id: string;
  quantity: number;
  discount_pct: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
}

export interface VanSellPreview {
  lines: VanSellPreviewLine[];
  totals: DocumentTotals;
}

/**
 * Read-only price preview for the Review step. Resolves the AUTHORITATIVE unit
 * price of every line via erp_resolve_price (never a client price) and the per
 * product tax, then totals them with the shared pure core — so what the rep sees
 * matches exactly what erp_van_sell will commit. Creates nothing.
 */
export async function previewVanSale(input: { branch_id: string; customer_id: string; lines: VanSellLineInput[] }): Promise<ActionResult<VanSellPreview>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!input.branch_id || !input.customer_id) return { ok: false, error: 'Branch and customer are required.' };

  const lines = normalizeVanSellLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Resolve each line server-side. One round-trip per product is fine for a van
  // cart (a handful of SKUs); the RPC re-resolves on issue, so this is advisory.
  const productIds = [...new Set(lines.map((l) => l.product_id))];
  const { data: taxRows } = await supabase
    .from('erp_products_catalog')
    .select('id, tax_rate')
    .in('id', productIds);
  const taxById = new Map((taxRows ?? []).map((r) => [(r as { id: string }).id, Number((r as { tax_rate: number }).tax_rate ?? 0)]));

  // U3: when multi-UoM is on, price each line per its entered UoM (price-book
  // per-uom special, else the rule-based base price × factor) — mirroring the RPC
  // so the preview matches what erp_van_sell will commit. Flag off ⇒ base only.
  const multiUom = ctx.companyId ? multiUomEnabled(await getFeatureFlags(supabase, ctx.companyId)) : false;
  const unitsById = multiUom ? await loadProductUnitsMany(supabase, productIds) : null;
  const today = new Date().toISOString().slice(0, 10);

  const priced: VanSellPreviewLine[] = [];
  for (const l of lines) {
    const uom = multiUom ? (l.uom ?? null) : null;
    const units = uom ? unitsById?.get(l.product_id)?.units : undefined;
    const factor = uom && units ? factorOf(units, uom) : 1;
    let unit_price = 0;
    if (uom && factor !== 1) {
      const { data: sp } = await supabase
        .from('erp_prices')
        .select('price').eq('product_id', l.product_id).eq('uom', uom).eq('is_active', true)
        .lte('effective_from', today).lte('min_qty', l.quantity)
        .order('min_qty', { ascending: false }).limit(1).maybeSingle();
      const special = (sp as { price?: number } | null)?.price;
      if (special != null) {
        unit_price = Number(special);
      } else {
        const { data: pr } = await supabase.rpc('erp_resolve_price', {
          p_product_id: l.product_id, p_customer_id: input.customer_id, p_branch_id: input.branch_id, p_qty: l.quantity * factor,
        });
        const row = (Array.isArray(pr) ? pr[0] : pr) as { price: number } | undefined;
        unit_price = Number(row?.price ?? 0) * factor;
      }
    } else {
      const { data: pr, error } = await supabase.rpc('erp_resolve_price', {
        p_product_id: l.product_id, p_customer_id: input.customer_id, p_branch_id: input.branch_id, p_qty: l.quantity,
      });
      if (error) return { ok: false, error: friendlyDbError(error) };
      const row = (Array.isArray(pr) ? pr[0] : pr) as { price: number } | undefined;
      unit_price = Number(row?.price ?? 0);
    }
    const tax_rate = taxById.get(l.product_id) ?? 0;
    const gross = Math.round((l.quantity * unit_price + Number.EPSILON) * 100) / 100;
    const discount = Math.round((gross * l.discount_pct) / 100 * 100 + Number.EPSILON) / 100;
    const line_total = Math.round((gross - discount + Number.EPSILON) * 100) / 100;
    priced.push({ product_id: l.product_id, quantity: l.quantity, discount_pct: l.discount_pct, unit_price, tax_rate, line_total });
  }

  const totals = computeVanSellTotals(priced.map((p) => ({
    product_id: p.product_id, quantity: p.quantity, unit_price: p.unit_price, discount_pct: p.discount_pct, tax_rate: p.tax_rate,
  })));

  return { ok: true, data: { lines: priced, totals } };
}

/**
 * Sell off the van: create + issue an invoice against the rep's van in one
 * atomic RPC. Returns the new invoice id. Gated by Van Sales being active for
 * the company (KAKO_VAN_SALES + per-company toggle); a no-op otherwise.
 */
export async function vanSell(input: VanSellInput): Promise<ActionResult<{ id: string; invoiceNumber: string; netAmount: number }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();

  // Enablement gate — Van Sales must be active for this company.
  if (!(await isVanSalesActive(supabase, ctx))) {
    return { ok: false, error: 'Van Sales is not enabled.' };
  }

  if (!input.branch_id) return { ok: false, error: 'Branch is required.' };
  if (!input.customer_id) return { ok: false, error: 'Customer is required.' };

  const lines = normalizeVanSellLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Fast discount-cap pre-check (the RPC re-enforces it as the authority).
  if (ctx.companyId) {
    const settings = await loadVanSalesSettings(supabase, ctx.companyId);
    const over = firstDiscountOverCap(lines, settings.discountCapPct);
    if (over) return { ok: false, error: RPC_ERRORS.discount_exceeds_cap };
  }

  // U3: pass the entered UoM per line ONLY when multi-UoM is enabled for the
  // company (flag-gated). The RPC converts uom→base, prices per uom, and keeps
  // stock in base units. Flag off ⇒ uom is null ⇒ identical to the legacy sale.
  const multiUom = ctx.companyId ? multiUomEnabled(await getFeatureFlags(supabase, ctx.companyId)) : false;
  const { data, error } = await supabase.rpc('erp_van_sell', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    // Only product / quantity / discount / uom — the price is resolved server-side.
    p_lines: lines.map((l) => ({
      product_id: l.product_id, quantity: l.quantity, discount_pct: l.discount_pct,
      uom: multiUom ? (l.uom ?? null) : null,
    })),
    p_idempotency_key: input.idempotency_key ?? null,
    p_due_date: input.due_date ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) {
    return { ok: false, error: RPC_ERRORS[error.message] ?? friendlyDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { invoice_id: string; invoice_number: string; net_amount: number }
    | undefined;
  if (!row?.invoice_id) return { ok: false, error: 'Van sale failed.' };

  // Mirror issueInvoice: announce the issued invoice for downstream consumers
  // (finance posting / webhooks). No-op unless KAKO_EVENTS is on.
  await emitDomainEvent({ eventType: EVENT.INVOICE_ISSUED, entity: 'invoice', recordId: row.invoice_id });
  revalidatePath('/sales/invoices');
  revalidatePath('/customers');

  return { ok: true, data: { id: row.invoice_id, invoiceNumber: row.invoice_number, netAmount: Number(row.net_amount) } };
}
