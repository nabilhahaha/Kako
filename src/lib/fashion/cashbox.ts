/** Fashion pack — cash-box reconciliation math (pure, client-safe, no DB).
 *  Mirrors erp_fashion_close_cashbox (migrations 0146 + 0161): expected = opening
 *  float + inflows (sale/collection/payin/owner_deposit) − outflows
 *  (expense/supplier_payment/payout/owner_withdrawal) + signed adjustments. */

import { round2 } from './installments';

export type CashMovementKind =
  | 'sale' | 'collection' | 'payin' | 'owner_deposit'
  | 'expense' | 'supplier_payment' | 'payout' | 'owner_withdrawal'
  | 'adjustment';

export const CASH_INFLOWS: CashMovementKind[] = ['sale', 'collection', 'payin', 'owner_deposit'];
export const CASH_OUTFLOWS: CashMovementKind[] = ['expense', 'supplier_payment', 'payout', 'owner_withdrawal'];

export interface CashMovement {
  kind: CashMovementKind;
  amount: number;
}

export interface CashboxSummary {
  openingFloat: number;
  inflows: number;
  outflows: number;
  /** Net signed cash adjustments. */
  adjustments: number;
  expected: number;
  // ── Breakdown (for the daily-closing view) ──
  cashSales: number;
  collections: number;
  expenses: number;
  ownerWithdrawals: number;
  ownerDeposits: number;
}

/** Roll up movements into inflow / outflow / expected-cash totals + breakdown. */
export function cashboxSummary(openingFloat: number, movements: CashMovement[]): CashboxSummary {
  let inflows = 0, outflows = 0, adjustments = 0;
  let cashSales = 0, collections = 0, expenses = 0, ownerWithdrawals = 0, ownerDeposits = 0;
  for (const m of movements) {
    const amt = Number(m.amount) || 0;
    if (m.kind === 'adjustment') adjustments = round2(adjustments + amt);
    else if (CASH_INFLOWS.includes(m.kind)) inflows = round2(inflows + amt);
    else if (CASH_OUTFLOWS.includes(m.kind)) outflows = round2(outflows + amt);

    switch (m.kind) {
      case 'sale': cashSales = round2(cashSales + amt); break;
      case 'collection': collections = round2(collections + amt); break;
      case 'expense': expenses = round2(expenses + amt); break;
      case 'owner_withdrawal': ownerWithdrawals = round2(ownerWithdrawals + amt); break;
      case 'owner_deposit': ownerDeposits = round2(ownerDeposits + amt); break;
    }
  }
  const opening = round2(Number(openingFloat) || 0);
  return {
    openingFloat: opening, inflows, outflows, adjustments,
    expected: round2(opening + inflows - outflows + adjustments),
    cashSales, collections, expenses, ownerWithdrawals, ownerDeposits,
  };
}

/** Variance = counted − expected (positive = over, negative = short). */
export function cashVariance(counted: number, expected: number): number {
  return round2((Number(counted) || 0) - (Number(expected) || 0));
}
