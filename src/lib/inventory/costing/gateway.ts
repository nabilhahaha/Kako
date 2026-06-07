// ============================================================================
// Inventory costing — gateway (the impure DB boundary for the costing service).
// Keeps the orchestration (service.ts) unit-testable with a fake and the engine
// (engine.ts) pure. The Supabase implementation lives in supabase-gateway.ts.
// ============================================================================

import type { CostingMethod, AvgCostState, CostLayer } from './types';

/** Persisted cost-state row for a (warehouse, product). */
export interface CostStateRow {
  method: CostingMethod;
  qty: number;
  avgCost: number;
}

/** A FIFO layer plus its persistent id, for targeted remaining-qty updates. */
export interface PersistedLayer extends CostLayer {
  id: string;
}

export interface CostingGateway {
  /** Current cost state for a (warehouse, product), or null if none yet. */
  loadState(warehouseId: string, productId: string): Promise<CostStateRow | null>;
  /** Upsert the moving-average / qty state (and method) for a (warehouse, product). */
  saveState(warehouseId: string, productId: string, method: CostingMethod, state: AvgCostState): Promise<void>;

  /** Open FIFO layers (remaining_qty > 0), oldest-first. */
  loadLayers(warehouseId: string, productId: string): Promise<PersistedLayer[]>;
  /** Append a FIFO receipt layer. */
  insertLayer(warehouseId: string, productId: string, qty: number, unitCost: number, sourceMovementId: string): Promise<void>;
  /** Persist the post-issue remaining quantities of consumed/leftover layers. */
  updateLayerRemaining(updates: Array<{ id: string; remainingQty: number }>): Promise<void>;

  /** Most recent standard cost effective on/before `date` (ISO), or null. */
  getStandardCost(warehouseId: string, productId: string, date: string): Promise<number | null>;

  /** Record the valued cost on the stock movement (the amount the GL will post). */
  setMovementCost(movementId: string, unitCost: number, totalCost: number): Promise<void>;
}
