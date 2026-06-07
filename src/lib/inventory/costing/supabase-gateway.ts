// ============================================================================
// Inventory costing — Supabase implementation of the CostingGateway (0188 tables).
// Thin DB adapter under the caller's RLS (warehouse→branch). server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CostingGateway, CostStateRow, PersistedLayer } from './gateway';
import type { CostingMethod, AvgCostState } from './types';

type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseCostingGateway(db: Db): CostingGateway {
  return {
    async loadState(warehouseId, productId) {
      const { data } = await db.from('erp_inventory_cost_state')
        .select('method, qty_on_hand, avg_cost')
        .eq('warehouse_id', warehouseId).eq('product_id', productId).maybeSingle();
      if (!data) return null;
      const row = data as { method: string; qty_on_hand: number; avg_cost: number };
      return { method: row.method as CostingMethod, qty: Number(row.qty_on_hand), avgCost: Number(row.avg_cost) } as CostStateRow;
    },

    async saveState(warehouseId, productId, method: CostingMethod, state: AvgCostState) {
      await db.from('erp_inventory_cost_state').upsert(
        { warehouse_id: warehouseId, product_id: productId, method, qty_on_hand: state.qty, avg_cost: state.avgCost, updated_at: new Date().toISOString() },
        { onConflict: 'warehouse_id,product_id' },
      );
    },

    async loadLayers(warehouseId, productId) {
      const { data } = await db.from('erp_inventory_cost_layers')
        .select('id, remaining_qty, unit_cost')
        .eq('warehouse_id', warehouseId).eq('product_id', productId)
        .gt('remaining_qty', 0).order('received_at', { ascending: true });
      return ((data ?? []) as Array<{ id: string; remaining_qty: number; unit_cost: number }>)
        .map((l): PersistedLayer => ({ id: l.id, qty: Number(l.remaining_qty), unitCost: Number(l.unit_cost) }));
    },

    async insertLayer(warehouseId, productId, qty, unitCost, sourceMovementId) {
      await db.from('erp_inventory_cost_layers').insert({
        warehouse_id: warehouseId, product_id: productId,
        remaining_qty: qty, unit_cost: unitCost, source_movement_id: sourceMovementId,
      });
    },

    async updateLayerRemaining(updates) {
      for (const u of updates) {
        await db.from('erp_inventory_cost_layers').update({ remaining_qty: u.remainingQty }).eq('id', u.id);
      }
    },

    async getStandardCost(warehouseId, productId, date) {
      const { data } = await db.from('erp_standard_costs')
        .select('standard_cost')
        .eq('warehouse_id', warehouseId).eq('product_id', productId)
        .lte('effective_from', date).order('effective_from', { ascending: false }).limit(1).maybeSingle();
      return data ? Number((data as { standard_cost: number }).standard_cost) : null;
    },

    async setMovementCost(movementId, unitCost, totalCost) {
      await db.from('erp_stock_movements').update({ unit_cost: unitCost, total_cost: totalCost }).eq('id', movementId);
    },
  };
}
