/** Fashion pack — cash-box reconciliation math (pure, client-safe, no DB).
 *  Mirrors erp_fashion_close_cashbox (migration 0146): expected = opening float
 *  + inflows (sale/collection/payin) − outflows (expense/supplier_payment/payout). */

import { round2 } from './installments';

export type CashMovementKind =
  | 'sale' | 'collection' | 'payin'
  | 'expense' | 'supplier_payment' | 'payout';

export const CASH_INFLOWS: CashMovementKind[] = ['sale', 'collection', 'payin'];
export const CASH_OUTFLOWS: CashMovementKind[] = ['expense', 'supplier_payment', 'payout'];

export interface CashMovement {
  kind: CashMovementKind;
  amount: number;
}

export interface CashboxSummary {
  openingFloat: number;
  inflows: number;
  outflows: number;
  expected: number;
}

/** Roll up movements into inflow / outflow / expected-cash totals. */
export function cashboxSummary(openingFloat: number, movements: CashMovement[]): CashboxSummary {
  let inflows = 0;
  let outflows = 0;
  for (const m of movements) {
    const amt = Number(m.amount) || 0;
    if (CASH_INFLOWS.includes(m.kind)) inflows = round2(inflows + amt);
    else if (CASH_OUTFLOWS.includes(m.kind)) outflows = round2(outflows + amt);
  }
  const opening = round2(Number(openingFloat) || 0);
  return { openingFloat: opening, inflows, outflows, expected: round2(opening + inflows - outflows) };
}

/** Variance = counted − expected (positive = over, negative = short). */
export function cashVariance(counted: number, expected: number): number {
  return round2((Number(counted) || 0) - (Number(expected) || 0));
}
