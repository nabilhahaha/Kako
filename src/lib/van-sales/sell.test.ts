import { describe, it, expect } from 'vitest';
import {
  normalizeVanSellLines,
  discountWithinCap,
  firstDiscountOverCap,
  computeVanSellTotals,
  collectInSellEnabled,
  sumTenders,
  paymentStatusFor,
  outstandingAfter,
  newBalanceAfter,
  validateTenders,
  availableCreditFor,
  creditBlocked,
  overdueDays,
  isOverdueBlocked,
  creditStatusOf,
  creditStandingBlocked,
  type PaymentTender,
} from './sell';

describe('van-sell pure core', () => {
  describe('normalizeVanSellLines', () => {
    it('drops lines without a product or with non-positive quantity', () => {
      const out = normalizeVanSellLines([
        { product_id: 'p1', quantity: 2 },
        { product_id: '', quantity: 5 },
        { product_id: 'p2', quantity: 0 },
        { product_id: 'p3', quantity: -1 },
      ]);
      expect(out.map((l) => l.product_id)).toEqual(['p1']);
    });

    it('defaults discount to 0 and clamps negatives', () => {
      const out = normalizeVanSellLines([
        { product_id: 'p1', quantity: 1 },
        { product_id: 'p2', quantity: 1, discount_pct: -5 },
        { product_id: 'p3', quantity: 1, discount_pct: 10 },
      ]);
      expect(out.map((l) => l.discount_pct)).toEqual([0, 0, 10]);
    });

    it('coerces string-like numerics', () => {
      const out = normalizeVanSellLines([
        // @ts-expect-error — exercise runtime coercion from loosely-typed input
        { product_id: 'p1', quantity: '3', discount_pct: '5' },
      ]);
      expect(out[0]).toEqual({ product_id: 'p1', quantity: 3, discount_pct: 5, uom: null });
    });
  });

  describe('discount cap', () => {
    it('treats a null cap as uncapped', () => {
      expect(discountWithinCap(99, null)).toBe(true);
      expect(firstDiscountOverCap([{ product_id: 'p', quantity: 1, discount_pct: 99 }], null)).toBeNull();
    });

    it('allows discounts at or below the cap, rejects above', () => {
      expect(discountWithinCap(10, 10)).toBe(true);
      expect(discountWithinCap(10.5, 10)).toBe(false);
    });

    it('returns the first offending line', () => {
      const over = firstDiscountOverCap(
        [
          { product_id: 'p1', quantity: 1, discount_pct: 5 },
          { product_id: 'p2', quantity: 1, discount_pct: 25 },
          { product_id: 'p3', quantity: 1, discount_pct: 30 },
        ],
        20,
      );
      expect(over?.product_id).toBe('p2');
    });
  });

  describe('computeVanSellTotals', () => {
    it('matches the shared sales-calc math (net = gross − discount + tax)', () => {
      // 2 × 100 = 200 gross; 10% discount = 20; net 180; 14% tax on 180 = 25.2
      const totals = computeVanSellTotals([
        { product_id: 'p1', quantity: 2, unit_price: 100, discount_pct: 10, tax_rate: 14 },
      ]);
      expect(totals).toEqual({
        total_amount: 200,
        discount_amount: 20,
        tax_amount: 25.2,
        net_amount: 205.2,
      });
    });

    it('sums multiple lines', () => {
      const totals = computeVanSellTotals([
        { product_id: 'p1', quantity: 1, unit_price: 50, discount_pct: 0, tax_rate: 0 },
        { product_id: 'p2', quantity: 3, unit_price: 10, discount_pct: 0, tax_rate: 0 },
      ]);
      expect(totals.total_amount).toBe(80);
      expect(totals.net_amount).toBe(80);
    });
  });

  // ── Collection-in-Sell payment core ───────────────────────────────────────
  describe('collectInSellEnabled', () => {
    it('is OFF by default and ON only with the platform flag', () => {
      expect(collectInSellEnabled(null)).toBe(false);
      expect(collectInSellEnabled({})).toBe(false);
      expect(collectInSellEnabled({ 'platform.collect_in_sell': false })).toBe(false);
      expect(collectInSellEnabled({ 'platform.collect_in_sell': true })).toBe(true);
    });
  });

  describe('payment math', () => {
    const cash = (amount: number): PaymentTender => ({ method: 'cash', amount, reference: null });

    it('sumTenders adds valid amounts and ignores non-positive', () => {
      expect(sumTenders([cash(400), { method: 'credit_card', amount: 200, reference: null }])).toBe(600);
      expect(sumTenders([cash(0), cash(-5), cash(100)])).toBe(100);
      expect(sumTenders([])).toBe(0);
    });

    it('paymentStatusFor maps the four scenarios', () => {
      expect(paymentStatusFor(1000, 1000)).toBe('paid');      // full cash
      expect(paymentStatusFor(1000, 0)).toBe('credit');       // full credit
      expect(paymentStatusFor(1000, 400)).toBe('partially_paid'); // partial
      expect(paymentStatusFor(1000, 600)).toBe('partially_paid'); // mixed < net
    });

    it('outstandingAfter never goes negative', () => {
      expect(outstandingAfter(1000, 400)).toBe(600);
      expect(outstandingAfter(1000, 1000)).toBe(0);
      expect(outstandingAfter(1000, 1200)).toBe(0);
    });

    it('newBalanceAfter = prior + net − paid', () => {
      expect(newBalanceAfter(0, 1000, 400)).toBe(600);
      expect(newBalanceAfter(250, 1000, 1000)).toBe(250);
      expect(newBalanceAfter(0, 1000, 0)).toBe(1000);
    });
  });

  describe('validateTenders', () => {
    it('accepts a valid mixed-tender set within net', () => {
      expect(validateTenders(1000, [
        { method: 'cash', amount: 400, reference: null },
        { method: 'credit_card', amount: 200, reference: null },
      ])).toBeNull();
    });
    it('rejects overpayment', () => {
      expect(validateTenders(1000, [{ method: 'cash', amount: 1200, reference: null }])).toBe('payment_exceeds_total');
    });
    it('rejects a non-positive amount', () => {
      expect(validateTenders(1000, [{ method: 'cash', amount: 0, reference: null }])).toBe('tender_invalid_amount');
    });
    it('requires a reference for cheque / bank transfer', () => {
      expect(validateTenders(1000, [{ method: 'check', amount: 100, reference: '' }])).toBe('tender_reference_required');
      expect(validateTenders(1000, [{ method: 'bank_transfer', amount: 100, reference: 'TRX-1' }])).toBeNull();
    });
    it('allows the empty (credit) tender set', () => {
      expect(validateTenders(1000, [])).toBeNull();
    });
  });

  describe('credit-limit guard', () => {
    it('example 1 — limit 0, fully paid ⇒ allowed', () => {
      expect(creditBlocked(0, 0, 1000, 1000)).toBe(false);
    });
    it('example 2 — limit 0, partial ⇒ blocked', () => {
      expect(creditBlocked(0, 0, 1000, 600)).toBe(true);
    });
    it('example 3 — limit 5000, bal 4000 (avail 1000), net 2000 paid 1200 (rem 800) ⇒ allowed', () => {
      expect(availableCreditFor(5000, 4000)).toBe(1000);
      expect(creditBlocked(5000, 4000, 2000, 1200)).toBe(false);
    });
    it('example 4 — same but paid 500 (rem 1500 > 1000) ⇒ blocked', () => {
      expect(creditBlocked(5000, 4000, 2000, 500)).toBe(true);
    });
    it('balance ≥ limit ⇒ any unpaid blocked, but full payment still allowed', () => {
      expect(creditBlocked(5000, 5000, 1000, 0)).toBe(true);
      expect(creditBlocked(5000, 5000, 1000, 1000)).toBe(false);
    });
  });

  describe('overdue / credit-days block', () => {
    it('overdueDays counts whole days, floored at 0', () => {
      expect(overdueDays('2026-06-01', '2026-06-14')).toBe(13);
      expect(overdueDays('2026-06-20', '2026-06-14')).toBe(0);
      expect(overdueDays(null, '2026-06-14')).toBeNull();
    });
    it('blocks when oldest unpaid age exceeds the terms window', () => {
      expect(isOverdueBlocked(30, '2026-05-01', '2026-06-14')).toBe(true);  // 44 > 30
      expect(isOverdueBlocked(60, '2026-05-01', '2026-06-14')).toBe(false); // 44 < 60
    });
    it('no block when terms unset, no open invoice, or credit control off', () => {
      expect(isOverdueBlocked(0, '2026-01-01', '2026-06-14')).toBe(false);
      expect(isOverdueBlocked(30, null, '2026-06-14')).toBe(false);
      expect(isOverdueBlocked(30, '2026-01-01', '2026-06-14', false)).toBe(false);
    });
    it('an overdue customer is blocked for ANY new credit, but full payment passes', () => {
      expect(creditBlocked(5000, 1000, 1000, 0, true)).toBe(true);     // overdue + unpaid
      expect(creditBlocked(5000, 1000, 1000, 1000, true)).toBe(false); // overdue + fully paid
    });
  });

  describe('creditStatusOf', () => {
    it('classifies good / over_limit / overdue / cash_only', () => {
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 1000, overdue: false })).toBe('good');
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 5000, overdue: false })).toBe('over_limit');
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 1000, overdue: true })).toBe('overdue');
      expect(creditStatusOf({ creditLimit: 0, currentBalance: 0, overdue: false })).toBe('cash_only');
    });
    it('flags near_limit (non-blocking) when available < 10% of limit', () => {
      // limit 5000, 10% threshold = 500. balance 4600 ⇒ available 400 < 500 ⇒ near.
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 4600, overdue: false })).toBe('near_limit');
      // balance 4000 ⇒ available 1000 ≥ 500 ⇒ good.
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 4000, overdue: false })).toBe('good');
      // configurable threshold (20% = 1000): available 1000 is not < 1000 ⇒ good; 4100→900<1000 near.
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 4100, overdue: false, nearThresholdPct: 0.20 })).toBe('near_limit');
    });
    it('near_limit never overrides a blocking state (overdue / over_limit win)', () => {
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 4900, overdue: true })).toBe('overdue');
      expect(creditStatusOf({ creditLimit: 5000, currentBalance: 5000, overdue: false })).toBe('over_limit');
    });
  });

  describe('creditStandingBlocked', () => {
    it('blocks credit standing for over_limit / overdue / cash_only only', () => {
      expect(creditStandingBlocked('good')).toBe(false);
      expect(creditStandingBlocked('near_limit')).toBe(false);
      expect(creditStandingBlocked('over_limit')).toBe(true);
      expect(creditStandingBlocked('overdue')).toBe(true);
      expect(creditStandingBlocked('cash_only')).toBe(true);
    });
  });
});
