// ============================================================================
// Inventory costing — service (orchestrates one stock movement into a valued
// cost, Phase 1). Pure orchestration over the CostingGateway + the pure engine.
// Data-integrity invariants (unit-tested): never values when disabled; receipts
// require a unit cost; issues never fabricate cost (engine throws on shortfall);
// the valued cost is recorded on the movement for the GL to post. Same posting
// shape across methods — only the number differs. Flag-gated KAKO_INVENTORY_COSTING.
// ============================================================================

import { INVENTORY_COSTING_ENABLED } from '../flags';
import { avgReceipt, avgIssue, fifoReceipt, fifoIssue, standardValue } from './engine';
import type { CostingMethod, AvgCostState } from './types';
import type { CostingGateway, PersistedLayer } from './gateway';

const DEFAULT_METHOD: CostingMethod = 'moving_average';

export interface CostedMovementInput {
  warehouseId: string;
  productId: string;
  movementId: string;
  /** Signed quantity: positive = receipt (stock in), negative = issue (stock out). */
  quantity: number;
  /** Required for receipts; ignored for issues (cost is computed). */
  unitCost?: number;
  /** Override the method; otherwise the persisted state's method, else the default. */
  method?: CostingMethod;
  /** ISO date for standard-cost lookup; defaults to today. */
  date?: string;
}

export type CostedResult =
  | { applied: true; method: CostingMethod; unitCost: number; totalCost: number; priceVariance?: number }
  | { applied: false; reason: 'disabled' | 'zero_qty' | 'missing_unit_cost' };

export class MissingUnitCostError extends Error {
  constructor() { super('receipt requires a unit cost'); this.name = 'MissingUnitCostError'; }
}

/** Value a single stock movement and persist the resulting cost state. No-op when
 *  KAKO_INVENTORY_COSTING is off. Returns the valued cost the GL should post. */
export async function applyCostedMovement(gw: CostingGateway, input: CostedMovementInput): Promise<CostedResult> {
  if (!INVENTORY_COSTING_ENABLED()) return { applied: false, reason: 'disabled' };
  if (input.quantity === 0) return { applied: false, reason: 'zero_qty' };

  const { warehouseId, productId, movementId } = input;
  const date = input.date ?? new Date().toISOString().slice(0, 10);

  const existing = await gw.loadState(warehouseId, productId);
  const method: CostingMethod = input.method ?? existing?.method ?? DEFAULT_METHOD;
  const state: AvgCostState = { qty: existing?.qty ?? 0, avgCost: existing?.avgCost ?? 0 };

  const isReceipt = input.quantity > 0;
  const qty = Math.abs(input.quantity);

  let unitCost = 0;
  let totalCost = 0;
  let priceVariance: number | undefined;

  if (method === 'fifo') {
    const layers = await gw.loadLayers(warehouseId, productId);
    if (isReceipt) {
      if (input.unitCost == null) throw new MissingUnitCostError();
      fifoReceipt(layers, qty, input.unitCost); // shape validation (pure)
      await gw.insertLayer(warehouseId, productId, qty, input.unitCost, movementId);
      unitCost = input.unitCost;
      totalCost = round2(qty * input.unitCost);
      await gw.saveState(warehouseId, productId, method, { qty: state.qty + qty, avgCost: state.avgCost });
    } else {
      const { cost, state: remaining } = fifoIssue(layers, qty); // throws on shortfall
      await gw.updateLayerRemaining(diffLayers(layers, remaining));
      totalCost = cost;
      unitCost = round4(cost / qty);
      await gw.saveState(warehouseId, productId, method, { qty: state.qty - qty, avgCost: state.avgCost });
    }
  } else if (method === 'standard') {
    const std = (await gw.getStandardCost(warehouseId, productId, date)) ?? input.unitCost ?? state.avgCost;
    if (isReceipt) {
      if (input.unitCost == null) throw new MissingUnitCostError();
      const v = standardValue(qty, std, input.unitCost);
      totalCost = v.cost; priceVariance = v.priceVariance; unitCost = std;
      await gw.saveState(warehouseId, productId, method, { qty: state.qty + qty, avgCost: std });
    } else {
      totalCost = round2(qty * std); unitCost = std;
      await gw.saveState(warehouseId, productId, method, { qty: state.qty - qty, avgCost: std });
    }
  } else {
    // moving_average
    if (isReceipt) {
      if (input.unitCost == null) throw new MissingUnitCostError();
      const next = avgReceipt(state, qty, input.unitCost);
      unitCost = input.unitCost; totalCost = round2(qty * input.unitCost);
      await gw.saveState(warehouseId, productId, method, next);
    } else {
      const { cost, state: next } = avgIssue(state, qty); // throws on shortfall
      totalCost = cost; unitCost = next.avgCost;
      await gw.saveState(warehouseId, productId, method, next);
    }
  }

  await gw.setMovementCost(movementId, unitCost, totalCost);
  return { applied: true, method, unitCost, totalCost, ...(priceVariance != null ? { priceVariance } : {}) };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Map post-issue remaining layers back to persisted-row updates (by position).
 *  FIFO consumes from the front, so the surviving layers are a suffix of `before`:
 *  the first `consumedCount` are fully drained (remaining 0), and the next one may
 *  be partially consumed (its new qty is after[0]). */
function diffLayers(before: PersistedLayer[], after: { qty: number; unitCost: number }[]): Array<{ id: string; remainingQty: number }> {
  const consumedCount = before.length - after.length;
  return before.map((b, i) =>
    i < consumedCount
      ? { id: b.id, remainingQty: 0 }
      : { id: b.id, remainingQty: after[i - consumedCount].qty },
  );
}
