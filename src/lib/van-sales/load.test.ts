import { describe, it, expect } from 'vitest';
import {
  lineVariance, classifyConfirmation, postableQuantities, missingVarianceReasons,
  suggestedRequestQty, diffRequestLines,
} from './index';

describe('van-sales/load · confirmation', () => {
  it('Accept Full: exact load, no review', () => {
    const r = classifyConfirmation([{ productId: 'a', loadedQty: 10, acceptedQty: 10 }]);
    expect(r.status).toBe('accept_full');
    expect(r.hasVariance).toBe(false);
    expect(r.requiresReview).toBe(false);
    expect(r.totalAccepted).toBe(10);
  });

  it('Accept Partial: short only (no quality reason) → review', () => {
    const r = classifyConfirmation([{ productId: 'a', loadedQty: 10, acceptedQty: 8, reason: 'short' }]);
    expect(r.status).toBe('accept_partial');
    expect(r.requiresReview).toBe(true);
    expect(r.lines[0].varianceQty).toBe(-2);
  });

  it('Accept With Variance: a quality/extra discrepancy → review', () => {
    const r = classifyConfirmation([
      { productId: 'a', loadedQty: 10, acceptedQty: 8, reason: 'short' },
      { productId: 'b', loadedQty: 5, acceptedQty: 6, reason: 'extra' },   // extra → review-worthy
    ]);
    expect(r.status).toBe('accept_with_variance');
    expect(r.requiresReview).toBe(true);
    expect(r.totalVariance).toBe(-1);
    const damaged = classifyConfirmation([{ productId: 'c', loadedQty: 4, acceptedQty: 2, reason: 'damaged' }]);
    expect(damaged.status).toBe('accept_with_variance');
  });

  it('Reject Full: nothing accepted → review', () => {
    const r = classifyConfirmation([{ productId: 'a', loadedQty: 10, acceptedQty: 0 }]);
    expect(r.status).toBe('reject_full');
    expect(r.requiresReview).toBe(true);
  });

  it('only accepted quantities are postable to van stock', () => {
    expect(postableQuantities([
      { productId: 'a', loadedQty: 10, acceptedQty: 8 },
      { productId: 'b', loadedQty: 5, acceptedQty: 0 },
    ])).toEqual([{ productId: 'a', qty: 8 }]);
  });

  it('requires a reason wherever accepted ≠ loaded', () => {
    expect(missingVarianceReasons([
      { productId: 'a', loadedQty: 10, acceptedQty: 8 },          // missing reason
      { productId: 'b', loadedQty: 5, acceptedQty: 5 },           // no variance → ok
      { productId: 'c', loadedQty: 4, acceptedQty: 6, reason: 'extra' },
    ])).toEqual(['a']);
  });

  it('lineVariance is accepted minus loaded', () => {
    expect(lineVariance({ productId: 'a', loadedQty: 10, acceptedQty: 7 })).toBe(-3);
  });
});

describe('van-sales/load · suggested request qty (reuse)', () => {
  it('suggests demand over current van stock from history', () => {
    // avg(10,10,10)=10 demand, +10% safety = 11 target, minus 4 on van → 7.
    expect(suggestedRequestQty([10, 10, 10], 4)).toBe(7);
    expect(suggestedRequestQty([10, 10, 10], 100)).toBe(0); // overstocked → nothing
    expect(suggestedRequestQty([], 0)).toBe(0);
  });
});

describe('van-sales/load · supervisor adjustment diff (audit)', () => {
  it('reports added / removed / changed lines', () => {
    const before = [{ productId: 'a', quantity: 10 }, { productId: 'b', quantity: 5 }];
    const after = [{ productId: 'a', quantity: 8 }, { productId: 'c', quantity: 3 }];
    const d = diffRequestLines(before, after);
    expect(d).toContainEqual({ productId: 'a', before: 10, after: 8 });   // reduced
    expect(d).toContainEqual({ productId: 'b', before: 5, after: null }); // removed
    expect(d).toContainEqual({ productId: 'c', before: null, after: 3 }); // added
    expect(d.find((c) => c.productId === 'a')).toBeTruthy();
    expect(d.length).toBe(3);
  });
});
