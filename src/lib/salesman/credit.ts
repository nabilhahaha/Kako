import type { CreditLimit, CustomerBalance } from './types';

// Credit-control rules for new sales, mirroring FMCG SFA behaviour:
//  1. credit_limit === 0 / cash_only -> invoice must be fully paid.
//  2. An invoice's remaining balance must not push outstanding over the limit.
//  3. Overdue beyond allowed days -> block new sale, collection only.
//  4. Outstanding has reached/exceeded the limit -> block new sale, collection only.
//  5. An authorised override may permit a CASH-only sale despite a block (audited).

export type CreditReason =
  | 'cash_only'
  | 'overdue_blocked'
  | 'limit_exceeded';

export interface CreditEval {
  cashOnly: boolean;
  overdueBlocked: boolean;
  limitExceeded: boolean;
  /** Whether a normal new sale is allowed (false => collection only). */
  canSell: boolean;
  /** Remaining headroom for new credit (>= 0). */
  availableCredit: number;
  reasons: CreditReason[];
}

/** Minimal credit/balance view the engine needs. */
export type CreditInput = Pick<
  CreditLimit,
  'creditLimit' | 'allowedOverdueDays' | 'cashOnly'
> &
  Pick<CustomerBalance, 'outstandingBalance' | 'overdueAmount' | 'overdueDays'>;

export function evaluateCredit(c: CreditInput): CreditEval {
  const cashOnly = c.cashOnly || c.creditLimit <= 0;
  const overdueBlocked = c.overdueDays > c.allowedOverdueDays;
  const limitExceeded = !cashOnly && c.outstandingBalance >= c.creditLimit;
  const availableCredit = cashOnly
    ? 0
    : Math.max(0, c.creditLimit - c.outstandingBalance);

  const reasons: CreditReason[] = [];
  if (overdueBlocked) reasons.push('overdue_blocked');
  if (limitExceeded) reasons.push('limit_exceeded');
  if (cashOnly) reasons.push('cash_only');

  // A sale is blocked only by overdue or an exceeded limit. A cash-only
  // customer can still buy, but the invoice must be settled in full.
  const canSell = !overdueBlocked && !limitExceeded;

  return { cashOnly, overdueBlocked, limitExceeded, canSell, availableCredit, reasons };
}

export interface InvoiceCreditCheck {
  ok: boolean;
  error?: 'must_pay_full' | 'exceeds_credit' | 'blocked';
}

/**
 * Validate a proposed invoice total against what the customer paid now.
 * `override` permits an authorised cash sale despite a block (rule 5),
 * but the invoice must still be paid in full.
 */
export function checkInvoice(
  c: CreditInput,
  total: number,
  paidNow: number,
  override = false,
): InvoiceCreditCheck {
  const evalc = evaluateCredit(c);
  const remaining = Math.max(0, Math.round((total - paidNow) * 100) / 100);

  if (!evalc.canSell) {
    if (override) {
      return remaining <= 0 ? { ok: true } : { ok: false, error: 'must_pay_full' };
    }
    return { ok: false, error: 'blocked' };
  }

  if (evalc.cashOnly) {
    return remaining <= 0 ? { ok: true } : { ok: false, error: 'must_pay_full' };
  }

  return remaining <= evalc.availableCredit
    ? { ok: true }
    : { ok: false, error: 'exceeds_credit' };
}
