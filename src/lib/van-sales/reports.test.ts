import { describe, it, expect } from 'vitest';
import { loadFulfillment, serviceLevel } from './index';

describe('van-sales/reports · loadFulfillment', () => {
  it('lines up requested vs approved vs received with variances', () => {
    const rows = loadFulfillment(
      [
        { productId: 'a', requested: 10, approved: 8 }, // supervisor reduced to 8
        { productId: 'b', requested: 5, approved: null }, // not adjusted → approved 5
      ],
      [
        { productId: 'a', loaded: 8, accepted: 8 }, // received exactly the approved
        { productId: 'b', loaded: 5, accepted: 4 }, // short 1
      ],
    );
    const a = rows.find((r) => r.productId === 'a')!;
    expect(a).toMatchObject({ requested: 10, approved: 8, received: 8, varianceVsApproved: 0, varianceVsRequested: -2 });
    const b = rows.find((r) => r.productId === 'b')!;
    expect(b).toMatchObject({ requested: 5, approved: 5, received: 4, varianceVsApproved: -1, varianceVsRequested: -1 });
  });

  it('includes a supervisor-added product (received but never requested)', () => {
    const rows = loadFulfillment([{ productId: 'a', requested: 10, approved: 10 }], [
      { productId: 'a', loaded: 10, accepted: 10 },
      { productId: 'c', loaded: 3, accepted: 3 }, // added at load
    ]);
    expect(rows.find((r) => r.productId === 'c')).toMatchObject({ requested: 0, approved: 0, received: 3 });
  });
});

describe('van-sales/reports · serviceLevel', () => {
  it('computes fill rates + delivery accuracy + net variance', () => {
    const rows = loadFulfillment(
      [{ productId: 'a', requested: 10, approved: 8 }, { productId: 'b', requested: 5, approved: 5 }],
      [{ productId: 'a', loaded: 8, accepted: 8 }, { productId: 'b', loaded: 5, accepted: 4 }],
    );
    const sl = serviceLevel(rows);
    expect(sl.requestedTotal).toBe(15);
    expect(sl.approvedTotal).toBe(13);
    expect(sl.receivedTotal).toBe(12);
    expect(sl.approvedFillRate).toBeCloseTo(13 / 15, 3); // supervisor approved 86.7% of the ask
    expect(sl.receivedFillRate).toBeCloseTo(12 / 15, 3); // end-to-end 80%
    expect(sl.deliveryAccuracy).toBeCloseTo(12 / 13, 3); // received vs approved
    expect(sl.varianceLines).toBe(1);
    expect(sl.netVariance).toBe(-1);
  });

  it('handles an empty report safely', () => {
    expect(serviceLevel([])).toMatchObject({ requestedTotal: 0, approvedFillRate: 0, receivedFillRate: 0, deliveryAccuracy: 0 });
  });
});
