// ============================================================================
// Inventory Foundation — costing layer types (Phase 1, approved arch #132 §1/§8A).
// The costing layer owns HOW value is computed (Weighted-Average / FIFO / Standard)
// and emits a valued cost on each movement; the GL (Finance) posts whatever amount
// it is handed. These pure types/functions carry no DB — state is loaded/persisted
// by the inventory domain; the GL never sees this.
// ============================================================================

export type CostingMethod = 'moving_average' | 'fifo' | 'standard';

/** Moving-average running state for one (product[, warehouse]) scope. */
export interface AvgCostState {
  qty: number;
  avgCost: number;
}

/** One FIFO cost layer (a receipt lot), oldest-first when in an array. */
export interface CostLayer {
  qty: number;
  unitCost: number;
}

/** Result of valuing a stock issue: the COGS amount + the new cost state. */
export interface IssueValuation<S> {
  cost: number;
  state: S;
}

/** Result of valuing a standard-cost movement: cost at standard + variance vs actual. */
export interface StandardValuation {
  cost: number;          // qty * standardCost
  priceVariance: number; // (actualUnitCost - standardCost) * qty  (purchase price variance)
}

export class InsufficientStockError extends Error {
  constructor(public readonly available: number, public readonly requested: number) {
    super(`insufficient stock to value issue: available ${available}, requested ${requested}`);
    this.name = 'InsufficientStockError';
  }
}
