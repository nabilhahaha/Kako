'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { loadProductUnits } from '@/lib/erp/uom-server';
import { validatePurchase, baseMovement } from '@/lib/erp/uom-rules';
import { factorOf, toBase, priceToBase } from '@/lib/erp/uom';

/** Unit options for a product (receiving defaults to the purchase unit). */
export async function productUnits(productId: string): Promise<{ base: string; purchase: string; units: string[] }> {
  const { error } = await requireAuth();
  if (error || !productId) return { base: 'unit', purchase: 'unit', units: ['unit'] };
  const supabase = await createClient();
  const cfg = await loadProductUnits(supabase, productId);
  if (!cfg) return { base: 'unit', purchase: 'unit', units: ['unit'] };
  return { base: cfg.units.base, purchase: cfg.units.purchase || cfg.units.base, units: cfg.units.units.map((u) => u.uom) };
}

/**
 * Batch Intake (goods receipt). Receive stock in the PURCHASE/receiving unit;
 * the unit-governance engine converts to BASE units before any movement, so
 * inventory always holds base quantities. Writes a purchase_in stock movement
 * (trigger updates on-hand) and, when Batch Tracking is on, a batch row with
 * expiry. The audit preserves entered unit + entered qty + base qty.
 */
export async function receiveBatch(input: {
  product_id: string;
  qty: number;
  uom?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  cost_price?: number | null;
  supplier_id?: string | null;
  warehouse_id?: string | null;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  const perms = ctx.permissions as string[];
  if (!(perms.includes('inventory.adjust') || perms.includes('pricing.manage') || ctx.isSuperAdmin)) {
    return { ok: false, error: 'no_permission' };
  }
  if (!input.product_id) return { ok: false, error: 'product_required' };

  const supabase = await createClient();
  const cfg = await loadProductUnits(supabase, input.product_id);
  const base = cfg?.units.base ?? 'unit';
  const uom = input.uom || base;
  if (cfg) {
    const v = validatePurchase(input.qty, uom, cfg.units);
    if (!v.ok) return { ok: false, error: `uom_${v.error}` };
  } else if (!(input.qty > 0)) return { ok: false, error: 'qty_positive' };

  const factor = cfg ? factorOf(cfg.units, uom) : 1;
  const baseQty = toBase(input.qty, factor);
  const baseCost = input.cost_price != null ? priceToBase(Number(input.cost_price), factor) : null;

  // Resolve a warehouse in the caller's tenant (prefer the given / HQ / first).
  let warehouseId = input.warehouse_id || null;
  if (!warehouseId) {
    const { data: wh } = await supabase
      .from('erp_warehouses')
      .select('id, branch:erp_branches!inner(company_id, is_hq)')
      .eq('branch.company_id', ctx.companyId).eq('is_active', true)
      .order('branch(is_hq)', { ascending: false }).limit(1).maybeSingle();
    warehouseId = (wh as { id: string } | null)?.id ?? null;
  }
  if (!warehouseId) return { ok: false, error: 'no_warehouse' };

  // Stock movement (trigger updates on-hand). Quantity is in BASE units.
  const { error: mvErr } = await supabase.from('erp_stock_movements').insert({
    movement_type: 'purchase_in', warehouse_id: warehouseId, product_id: input.product_id,
    quantity: baseQty, reference_type: 'batch_intake',
    unit_cost: baseCost, total_cost: baseCost != null ? Math.round((baseCost * baseQty) * 100) / 100 : null,
    notes: `intake ${input.qty} ${uom}${input.batch_number ? ` · batch ${input.batch_number}` : ''}${input.expiry_date ? ` · exp ${input.expiry_date}` : ''}`,
    created_by: ctx.userId,
  });
  if (mvErr) return { ok: false, error: mvErr.message };

  // Batch row (when Batch Tracking enabled) — carries expiry/lot for FEFO.
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.batch_tracking']) {
    await supabase.from('erp_product_batches').insert({
      company_id: ctx.companyId, product_id: input.product_id, warehouse_id: warehouseId,
      batch_number: input.batch_number?.trim() || null,
      expiry_date: input.expiry_date || null,
      qty_on_hand: baseQty, cost_price: baseCost,
      supplier_id: input.supplier_id || null, created_by: ctx.userId,
    });
  }

  await logAudit(supabase, {
    action: 'create', entity: 'batch_intake', entityId: input.product_id,
    details: { ...baseMovement(input.qty, uom, cfg?.units ?? { base, units: [{ uom: base, factor: 1 }] }),
      batch: input.batch_number ?? null, expiry: input.expiry_date ?? null, cost_base: baseCost },
    companyId: ctx.companyId,
  });
  revalidatePath('/pharmacy/receive');
  revalidatePath('/pharmacy/pos');
  revalidatePath('/inventory');
  return { ok: true };
}
