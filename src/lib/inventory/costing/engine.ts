// ============================================================================
// Inventory Foundation — pure costing engine (Phase 1). No DB, no I/O. Computes
// valued cost for receipts/issues under each method, returning NEW immutable
// state. The amount produced here is what the Finance engine posts (Dr COGS /
// Cr Inventory on issue; Dr Inventory / Cr GR-IR on receipt) — "amount-agnostic
// GL". Same posting shape across methods; only the number differs (arch #132 §1).
// ============================================================================

import {
  type AvgCostState, type CostLayer, type IssueValuation, type StandardValuation,
  InsufficientStockError,
} from './types';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

// ── Weighted (moving) average ───────────────────────────────────────────────

/** Apply a receipt: recompute the running average unit cost. */
export function avgReceipt(state: AvgCostState, qty: number, unitCost: number): AvgCostState {
  if (qty <= 0) return state;
  const newQty = state.qty + qty;
  if (newQty <= 0) return { qty: newQty, avgCost: state.avgCost };
  const newAvg = (state.qty * state.avgCost + qty * unitCost) / newQty;
  return { qty: newQty, avgCost: round4(newAvg) };
}

/** Value an issue at the current average; quantity decremented, average unchanged. */
export function avgIssue(state: AvgCostState, qty: number): IssueValuation<AvgCostState> {
  if (qty <= 0) return { cost: 0, state };
  if (qty > state.qty) throw new InsufficientStockError(state.qty, qty);
  return { cost: round2(qty * state.avgCost), state: { qty: state.qty - qty, avgCost: state.avgCost } };
}

// ── FIFO (cost-layer ledger) ─────────────────────────────────────────────────

/** Apply a receipt: append a new cost layer (oldest-first ordering preserved). */
export function fifoReceipt(layers: CostLayer[], qty: number, unitCost: number): CostLayer[] {
  if (qty <= 0) return layers;
  return [...layers, { qty, unitCost }];
}

/** Value an issue by consuming the oldest layers first; returns COGS + remaining layers. */
export function fifoIssue(layers: CostLayer[], qty: number): IssueValuation<CostLayer[]> {
  if (qty <= 0) return { cost: 0, state: layers };
  const available = layers.reduce((s, l) => s + l.qty, 0);
  if (qty > available) throw new InsufficientStockError(available, qty);

  let remaining = qty;
  let cost = 0;
  const out: CostLayer[] = [];
  for (const layer of layers) {
    if (remaining <= 0) { out.push(layer); continue; }
    const take = Math.min(layer.qty, remaining);
    cost += take * layer.unitCost;
    remaining -= take;
    const left = layer.qty - take;
    if (left > 0) out.push({ qty: left, unitCost: layer.unitCost });
  }
  return { cost: round2(cost), state: out };
}

// ── Standard cost ────────────────────────────────────────────────────────────

/** Value a movement at standard; compute the purchase-price variance vs actual. */
export function standardValue(qty: number, standardCost: number, actualUnitCost: number): StandardValuation {
  return {
    cost: round2(qty * standardCost),
    priceVariance: round2((actualUnitCost - standardCost) * qty),
  };
}
