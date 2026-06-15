'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { requireActionPerm } from '@/lib/erp/action-authz';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';

/**
 * Start a stock count for a warehouse: snapshots the current system quantity
 * of every active product (counted defaults to system until edited).
 */
export async function createStockCount(warehouseId: string): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const denied = await requireActionPerm(ctx, ['inventory.count']);
  if (denied) return denied;
  const { t } = await getT();
  if (!warehouseId) return { ok: false, error: t('inventory.errorSelectWarehouse') };

  const supabase = await createClient();
  const { data: wh } = await supabase
    .from('erp_warehouses')
    .select('id, branch_id')
    .eq('id', warehouseId)
    .single();
  if (!wh) return { ok: false, error: t('inventory.errorWarehouseNotFound') };

  const { data: number, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: wh.branch_id,
    p_seq_type: 'stock_count',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: count, error: cErr } = await supabase
    .from('erp_stock_counts')
    .insert({ warehouse_id: warehouseId, count_number: number as string, status: 'draft', counted_by: ctx!.userId })
    .select('id')
    .single();
  if (cErr) return { ok: false, error: friendlyDbError(cErr) };

  // Snapshot active products with their current on-hand quantity in this warehouse.
  const [{ data: products }, { data: stock }] = await Promise.all([
    supabase.from('erp_products_catalog').select('id').eq('is_active', true),
    supabase.from('erp_inventory_stock').select('product_id, quantity').eq('warehouse_id', warehouseId),
  ]);
  const qtyByProduct = new Map((stock ?? []).map((s) => [s.product_id, Number(s.quantity)]));
  const lines = (products ?? []).map((p) => ({
    count_id: count.id,
    product_id: p.id,
    system_qty: qtyByProduct.get(p.id) ?? 0,
    counted_qty: qtyByProduct.get(p.id) ?? 0,
  }));
  if (lines.length > 0) {
    const { error: lErr } = await supabase.from('erp_stock_count_lines').insert(lines);
    if (lErr) {
      await supabase.from('erp_stock_counts').delete().eq('id', count.id);
      return { ok: false, error: friendlyDbError(lErr) };
    }
  }

  revalidatePath('/inventory/count');
  return { ok: true, data: { id: count.id } };
}

/** Persist counted quantities for the count's lines. */
export async function saveStockCount(
  countId: string,
  lines: Array<{ id: string; counted_qty: number }>,
): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const denied = await requireActionPerm(ctx, ['inventory.count']);
  if (denied) return denied;

  const supabase = await createClient();
  for (const l of lines) {
    const { error } = await supabase
      .from('erp_stock_count_lines')
      .update({ counted_qty: l.counted_qty })
      .eq('id', l.id)
      .eq('count_id', countId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/inventory/count');
  return { ok: true };
}

/** Save then finalize: posts variance adjustments and marks completed (atomic). */
export async function finalizeStockCount(
  countId: string,
  lines: Array<{ id: string; counted_qty: number }>,
): Promise<ActionResult> {
  // MJ-1: finalizing a count posts variance movements — require inventory.count.
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();
  if (!hasPermission(ctx, 'inventory.count')) return { ok: false, error: t('settings.unauthorized') };

  const saved = await saveStockCount(countId, lines);
  if (!saved.ok) return saved;

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_finalize_stock_count', { p_count_id: countId });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/inventory/count');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function cancelStockCount(countId: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const denied = await requireActionPerm(ctx, ['inventory.count']);
  if (denied) return denied;
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_stock_counts')
    .update({ status: 'cancelled' })
    .eq('id', countId)
    .eq('status', 'draft');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/count');
  return { ok: true };
}
