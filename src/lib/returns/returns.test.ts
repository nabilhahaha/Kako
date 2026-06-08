import { describe, it, expect } from 'vitest';
import {
  RETURNS_ENABLED,
  canCreateReturn, DEFAULT_RETURN_POLICY,
  reconcileReturnLine, reconcileReturn, type OriginalLine,
  validateReturn, isReturnValid,
  buildCreditNote,
  returnsBy, returnRatePct, nearExpiryAnalytics, type ReturnRecord,
} from './index';

describe('returns/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_RETURNS;
    delete process.env.KAKO_RETURNS;
    expect(RETURNS_ENABLED()).toBe(false);
    process.env.KAKO_RETURNS = '1';
    expect(RETURNS_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_RETURNS; else process.env.KAKO_RETURNS = prev;
  });
});

describe('returns/policy (company-configurable)', () => {
  it('from-invoice always allowed; manual gated; exception needs approval', () => {
    expect(canCreateReturn('from_invoice').allowed).toBe(true);
    expect(canCreateReturn('manual', DEFAULT_RETURN_POLICY).allowed).toBe(false);
    expect(canCreateReturn('manual', { ...DEFAULT_RETURN_POLICY, allowManualWithApproval: true })).toEqual({ allowed: true, requiresApproval: true });
    expect(canCreateReturn('manual', { ...DEFAULT_RETURN_POLICY, allowManualWithoutApproval: true })).toEqual({ allowed: true, requiresApproval: false });
    expect(canCreateReturn('exception').requiresApproval).toBe(true);
  });
});

describe('returns/reconciliation (reverses commercial reality)', () => {
  const orig: OriginalLine = {
    invoiceLineId: 'L1', productId: 'P1',
    soldQty: 100, freeQtySold: 10, unitPrice: 50, discountAmount: 500, // 10% on 5000
    fundingAllocations: [{ source: 'supplier', percent: 50, amount: 250 }, { source: 'company', percent: 50, amount: 250 }],
    incentivePayouts: [{ role: 'salesman', gross: 200, net: 200 }],
    commissionRule: { kind: 'percentage', percent: 2 }, commissionBase: 5000,
  };

  it('reverses free goods, discount, funding, incentive, commission proportionally (return 20 of 100)', () => {
    const r = reconcileReturnLine(orig, 20);
    expect(r.reversalRatio).toBe(0.2);
    expect(r.freeQtyReturned).toBe(2);          // 20/100 × 10
    expect(r.discountReversed).toBe(100);       // 20% of 500
    expect(r.grossReturnValue).toBe(1000);      // 20 × 50
    expect(r.netReturnValue).toBe(900);
    expect(r.fundingReversed.map((f) => f.amount)).toEqual([50, 50]);
    expect(r.incentiveAdjustments[0].reversal).toBe(40);  // 20% of 200
    expect(r.commissionReversal).toBe(20);      // 2% of 5000 → 100; new base 4000 → 80; reversal 20
  });

  it('reconciles a full return + totals (200 sold, 20 free, return 50 → 5 free)', () => {
    const recon = reconcileReturn([{ original: { ...orig, soldQty: 200, freeQtySold: 20 }, returnedQty: 50 }]);
    expect(recon.lines[0].freeQtyReturned).toBe(5);
    expect(recon.totals.grossReturnValue).toBe(2500);
  });
});

describe('returns/validation', () => {
  it('errors block, warnings advise', () => {
    const issues = validateReturn([
      { productId: 'P1', returnedQty: 30, soldQtyHistorical: 100, soldQtyOnInvoice: 20 },  // exceeds invoice
      { productId: 'P2', returnedQty: 5, soldQtyHistorical: 0 },                            // never purchased (warn)
    ], { requireOriginalInvoice: true });
    expect(issues.some((i) => i.level === 'error' && i.message.includes('exceeds original invoice'))).toBe(true);
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('never purchased'))).toBe(true);
    expect(isReturnValid(issues)).toBe(false);
    expect(isReturnValid([{ field: 'x', message: 'm', level: 'warning' }])).toBe(true);
  });
});

describe('returns/credit-note', () => {
  it('builds from reconciliation with adjustments', () => {
    const recon = reconcileReturn([{
      original: { invoiceLineId: 'L1', productId: 'P1', soldQty: 100, freeQtySold: 10, unitPrice: 50, discountAmount: 500,
        fundingAllocations: [{ source: 'supplier', percent: 100, amount: 500 }], incentivePayouts: [{ role: 'salesman', gross: 200, net: 200 }],
        commissionRule: { kind: 'percentage', percent: 2 }, commissionBase: 5000 },
      returnedQty: 20,
    }]);
    const cn = buildCreditNote('R1', 'INV1', recon);
    expect(cn.amount).toBe(900);
    expect(cn.promotionAdjustment).toBe(200);    // discount 100 + funding 100
    expect(cn.incentiveAdjustment).toBe(40);
    expect(cn.commissionAdjustment).toBe(20);
  });
});

describe('returns/analytics', () => {
  const records: ReturnRecord[] = [
    { returnId: 'R1', customerId: 'C1', productId: 'P1', reason: 'damaged', returnedQty: 5, returnValue: 250, netReturnValue: 250 },
    { returnId: 'R2', customerId: 'C1', productId: 'P2', reason: 'near_expiry', returnedQty: 10, returnValue: 500, netReturnValue: 500, nearExpiry: true, recovered: true },
    { returnId: 'R3', customerId: 'C2', productId: 'P2', reason: 'near_expiry', returnedQty: 4, returnValue: 200, netReturnValue: 200, nearExpiry: true, recovered: false },
  ];
  it('groups by dimension + computes rate', () => {
    expect(returnsBy(records, 'customerId')[0].key).toBe('C1');
    expect(returnsBy(records, 'reason').find((x) => x.key === 'near_expiry')!.value).toBe(700);
    expect(returnRatePct(950, 10000)).toBe(9.5);
  });
  it('near-expiry recovery analytics', () => {
    const ne = nearExpiryAnalytics(records);
    expect(ne.nearExpiryReturns).toBe(2);
    expect(ne.recoveryValue).toBe(500);
    expect(ne.disposalValue).toBe(200);
    expect(ne.recoveryPct).toBeCloseTo(71.43, 1);
  });
});
