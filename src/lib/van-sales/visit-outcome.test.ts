import { describe, it, expect } from 'vitest';
import {
  outcomeNeedsReason, isCreditBlocked, canEndVisit, creditEffectivelyBlocked,
  noSaleReasonNeedsNote, NO_SALE_REASONS,
  NON_TXN_OUTCOMES, TXN_OUTCOMES, type VisitOutcomeKind,
} from './visit-outcome';

describe('noSaleReasonNeedsNote (No Sales reason sheet)', () => {
  it('exposes the eight no-sale reasons', () => {
    expect(NO_SALE_REASONS).toHaveLength(8);
    expect(NO_SALE_REASONS).toContain('competitor');
    expect(NO_SALE_REASONS).toContain('other');
  });
  it('requires a note ONLY for "other"', () => {
    expect(noSaleReasonNeedsNote('other')).toBe(true);
    for (const r of NO_SALE_REASONS.filter((x) => x !== 'other')) {
      expect(noSaleReasonNeedsNote(r)).toBe(false);
    }
  });
});

describe('outcomeNeedsReason', () => {
  it('requires a reason for EVERY non-transaction outcome', () => {
    for (const o of NON_TXN_OUTCOMES) expect(outcomeNeedsReason(o)).toBe(true);
  });
  it('does not require a reason for transaction outcomes', () => {
    for (const o of TXN_OUTCOMES) expect(outcomeNeedsReason(o)).toBe(false);
  });
});

describe('isCreditBlocked (credit control)', () => {
  it('blocks when overdue', () => {
    expect(isCreditBlocked({ overdueAmount: 100, availableCredit: 5000, creditLimit: 10000 })).toBe(true);
  });
  it('blocks when over the credit limit', () => {
    expect(isCreditBlocked({ overdueAmount: 0, availableCredit: -1, creditLimit: 10000 })).toBe(true);
  });
  it('does NOT block a healthy customer', () => {
    expect(isCreditBlocked({ overdueAmount: 0, availableCredit: 5000, creditLimit: 10000 })).toBe(false);
  });
  it('cash-only (limit 0) is never "over limit" — not blocked unless overdue', () => {
    expect(isCreditBlocked({ overdueAmount: 0, availableCredit: -500, creditLimit: 0 })).toBe(false);
    expect(isCreditBlocked({ overdueAmount: 50, availableCredit: -500, creditLimit: 0 })).toBe(true);
  });
});

describe('creditEffectivelyBlocked (Admin Credit Override)', () => {
  it('a blocked customer stays blocked without the override', () => {
    expect(creditEffectivelyBlocked(true, false)).toBe(true);
  });
  it('an authorized override bypasses the block (cash sale allowed)', () => {
    expect(creditEffectivelyBlocked(true, true)).toBe(false);
  });
  it('a healthy customer is never blocked, override or not', () => {
    expect(creditEffectivelyBlocked(false, false)).toBe(false);
    expect(creditEffectivelyBlocked(false, true)).toBe(false);
  });
  it('with override, a blocked customer may end the visit on any outcome', () => {
    const eff = creditEffectivelyBlocked(true, true);
    expect(canEndVisit('new_sale', eff)).toBe(true);
    expect(canEndVisit('return', eff)).toBe(true);
  });
  it('without override, a blocked customer is still limited to Collection / No Sale', () => {
    const eff = creditEffectivelyBlocked(true, false);
    expect(canEndVisit('new_sale', eff)).toBe(false);
    expect(canEndVisit('collection', eff)).toBe(true);
    expect(canEndVisit('no_sale', eff)).toBe(true);
  });
});

describe('canEndVisit', () => {
  const all: VisitOutcomeKind[] = [...TXN_OUTCOMES, ...NON_TXN_OUTCOMES];
  it('cannot end without an outcome', () => {
    expect(canEndVisit(null, false)).toBe(false);
    expect(canEndVisit(null, true)).toBe(false);
  });
  it('any recorded outcome ends a non-blocked visit', () => {
    for (const o of all) expect(canEndVisit(o, false)).toBe(true);
  });
  it('a blocked customer may only end with Collection or No Sale', () => {
    expect(canEndVisit('collection', true)).toBe(true);
    expect(canEndVisit('no_sale', true)).toBe(true);
    expect(canEndVisit('new_sale', true)).toBe(false);
    expect(canEndVisit('return', true)).toBe(false);
    expect(canEndVisit('customer_closed', true)).toBe(false);
    expect(canEndVisit('other', true)).toBe(false);
  });
});
