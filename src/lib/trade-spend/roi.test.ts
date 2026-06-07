import { describe, it, expect } from 'vitest';
import { computeRoi } from './roi';

describe('trade-spend ROI engine', () => {
  it('computes a profitable promotion', () => {
    // uplift 50000, margin 30% = 15000 margin; spend 5000 → net 10000, ratio 3
    const r = computeRoi({ baselineSales: 100000, actualSales: 150000, marginPct: 30, spend: 5000 });
    expect(r).toMatchObject({ incrementalSales: 50000, incrementalMargin: 15000, netRoi: 10000, roiRatio: 3, roiPct: 300, positive: true });
  });

  it('flags a loss-making promotion (margin < spend)', () => {
    const r = computeRoi({ baselineSales: 100000, actualSales: 110000, marginPct: 20, spend: 5000 }); // margin 2000 < 5000
    expect(r).toMatchObject({ incrementalMargin: 2000, netRoi: -3000, positive: false });
    expect(r.roiRatio).toBeCloseTo(0.4, 5);
  });

  it('handles negative uplift (promo underperformed baseline)', () => {
    const r = computeRoi({ baselineSales: 100000, actualSales: 90000, marginPct: 30, spend: 1000 });
    expect(r.incrementalSales).toBe(-10000);
    expect(r.incrementalMargin).toBe(-3000);
    expect(r.netRoi).toBe(-4000);
    expect(r.positive).toBe(false);
  });

  it('returns null ratio when spend is zero (no division by zero)', () => {
    const r = computeRoi({ baselineSales: 100000, actualSales: 120000, marginPct: 25, spend: 0 });
    expect(r.roiRatio).toBeNull();
    expect(r.roiPct).toBeNull();
    expect(r.positive).toBe(true); // margin 5000, spend 0 → net 5000
  });

  it('rounds to 2 decimals', () => {
    const r = computeRoi({ baselineSales: 0, actualSales: 1000, marginPct: 33.33, spend: 100 });
    expect(r.incrementalMargin).toBe(333.3);
  });
});
