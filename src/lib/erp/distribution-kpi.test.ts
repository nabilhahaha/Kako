import { describe, it, expect } from 'vitest';
import {
  productDistribution, distributionForProducts, summarizeDistribution, distributionByDimension,
  type OutletForKpi,
} from './distribution-kpi';

const outlets: OutletForKpi[] = [
  { customerId: 'big', weight: 100, soldProductIds: new Set(['p1', 'p2']) },
  { customerId: 'mid', weight: 50, soldProductIds: new Set(['p1']) },
  { customerId: 'small', weight: 10, soldProductIds: new Set([]) },
  { customerId: 'kiosk', weight: 10, soldProductIds: new Set(['p2']) },
];

describe('distribution-kpi · productDistribution', () => {
  it('numeric = outlets selling / total', () => {
    const d = productDistribution('p1', outlets);
    expect(d.outletsSelling).toBe(2);
    expect(d.totalOutlets).toBe(4);
    expect(d.numericPct).toBe(50);
  });
  it('weighted favours high-value outlets', () => {
    // p1 sold by big(100)+mid(50)=150 of total weight 170 → 88%
    expect(productDistribution('p1', outlets).weightedPct).toBe(88);
    // p2 sold by big(100)+kiosk(10)=110/170 → 65%, numeric 50%
    const d2 = productDistribution('p2', outlets);
    expect(d2.numericPct).toBe(50);
    expect(d2.weightedPct).toBe(65);
  });
  it('empty universe → 0', () => {
    expect(productDistribution('p1', []).numericPct).toBe(0);
  });
});

describe('distribution-kpi · ranking + summary', () => {
  it('orders weakest numeric first', () => {
    const rows = distributionForProducts(['p1', 'p9'], outlets); // p9 sold nowhere
    expect(rows[0].productId).toBe('p9');
    expect(rows[0].numericPct).toBe(0);
  });
  it('summarizes portfolio averages', () => {
    const s = summarizeDistribution(distributionForProducts(['p1', 'p2'], outlets));
    expect(s.products).toBe(2);
    expect(s.avgNumericPct).toBe(50);
    expect(s.avgWeightedPct).toBe(Math.round((88 + 65) / 2));
  });
});

describe('distribution-kpi · by dimension', () => {
  it('computes per-group distribution', () => {
    const modern = outlets.slice(0, 2);
    const traditional = outlets.slice(2);
    const groups = distributionByDimension(['p1'], [
      { key: 'modern', label: 'Modern', outlets: modern },
      { key: 'trad', label: 'Traditional', outlets: traditional },
    ]);
    expect(groups.find((g) => g.key === 'modern')!.numericPct).toBe(100); // both sell p1
    expect(groups.find((g) => g.key === 'trad')!.numericPct).toBe(0);     // neither sells p1
  });
});
