import { describe, it, expect } from 'vitest';
import { effectiveApprovedQty, lineDifference, loadableLines, isPartialApproval, type ApprovalLine } from './stock-request-approval';

// Mirrors the erp_approve_stock_request contract (migration 0319).
describe('stock request partial approval', () => {
  it('FULL approval — no adjustment → loads the requested qty (approved_qty null)', () => {
    const lines: ApprovalLine[] = [{ productId: 'p1', requestedQty: 100, approvedQty: null }];
    expect(effectiveApprovedQty(null, 100)).toBe(100);
    expect(loadableLines(lines)).toEqual([{ productId: 'p1', qty: 100 }]);
    expect(isPartialApproval(lines)).toBe(false);
  });

  it('PARTIAL approval — approved 70 of 100 → loads 70, diff −30', () => {
    const lines: ApprovalLine[] = [{ productId: 'p1', requestedQty: 100, approvedQty: 70 }];
    expect(loadableLines(lines)).toEqual([{ productId: 'p1', qty: 70 }]);
    expect(lineDifference(70, 100)).toBe(-30);
    expect(isPartialApproval(lines)).toBe(true);
  });

  it('INCREASED approved qty — approved 120 of 100 → loads 120, diff +20', () => {
    expect(effectiveApprovedQty(120, 100)).toBe(120);
    expect(lineDifference(120, 100)).toBe(20);
    expect(isPartialApproval([{ productId: 'p1', requestedQty: 100, approvedQty: 120 }])).toBe(true);
  });

  it('REDUCED approved qty — approved 1 of 100 → loads 1', () => {
    expect(loadableLines([{ productId: 'p1', requestedQty: 100, approvedQty: 1 }])).toEqual([{ productId: 'p1', qty: 1 }]);
    expect(lineDifference(1, 100)).toBe(-99);
  });

  it('REMOVED / zero-approved line → NOT loaded', () => {
    const lines: ApprovalLine[] = [
      { productId: 'p1', requestedQty: 100, approvedQty: 0 },
      { productId: 'p2', requestedQty: 50, approvedQty: null },
    ];
    expect(loadableLines(lines)).toEqual([{ productId: 'p2', qty: 50 }]); // p1 dropped
    expect(lineDifference(0, 100)).toBe(-100);
    expect(isPartialApproval(lines)).toBe(true);
  });
});
