import { describe, it, expect } from 'vitest';
import {
  rollupByDimension, summarizeOutletMetrics, topMissingSkus, availableDimensions,
  type OutletMetric,
} from './retail-rollup';

const mk = (id: string, dims: OutletMetric['dims'], required: number, present: number, missing: string[], opts: Partial<OutletMetric> = {}): OutletMetric => ({
  customerId: id, name: id, dims, required, present, gap: required - present,
  weightRequired: required, weightPresent: present, missingProductIds: missing,
  soldCount: present > 0 ? present : (opts.soldCount ?? 0), value: opts.value ?? 1,
  surveyScorePct: opts.surveyScorePct ?? null, hasMsl: required > 0,
});

const metrics: OutletMetric[] = [
  mk('c1', { region: { id: 'r1', label: 'North' }, channel: { id: 'ch1', label: 'Modern' } }, 4, 4, []),
  mk('c2', { region: { id: 'r1', label: 'North' }, channel: { id: 'ch2', label: 'Traditional' } }, 4, 2, ['p3', 'p4']),
  mk('c3', { region: { id: 'r2', label: 'South' }, channel: { id: 'ch2', label: 'Traditional' } }, 5, 1, ['p2', 'p3', 'p4', 'p5']),
  mk('c4', {}, 0, 0, [], { soldCount: 1 }), // no MSL → excluded from rollups, counts as active
];

describe('retail-rollup · rollupByDimension', () => {
  it('groups outlet metrics by a dynamic dimension, weakest first', () => {
    const byRegion = rollupByDimension(metrics, 'region');
    expect(byRegion.map((r) => r.label)).toEqual(['South', 'North']); // South weaker
    const north = byRegion.find((r) => r.label === 'North')!;
    expect(north.outlets).toBe(2);
    expect(north.compliancePct).toBe(75); // (4+2)/(4+4)
    expect(north.fullyCompliant).toBe(1);
    expect(north.gapLines).toBe(2);
  });
  it('works for a company-defined dimension (channel) with no code change', () => {
    const byChannel = rollupByDimension(metrics, 'channel');
    const trad = byChannel.find((r) => r.label === 'Traditional')!;
    expect(trad.outlets).toBe(2);          // c2 + c3
    expect(trad.compliancePct).toBe(Math.round((3 / 9) * 100)); // (2+1)/(4+5)
  });
});

describe('retail-rollup · summary + missing + dims', () => {
  it('summarizes portfolio totals incl. active customers and OOS%', () => {
    const s = summarizeOutletMetrics(metrics);
    expect(s.outlets).toBe(3);          // c4 has no MSL → excluded from MSL totals
    expect(s.activeCustomers).toBe(4);  // all four sold ≥1 SKU in the window
    expect(s.gapLines).toBe(6);         // 0 + 2 + 4
    expect(s.compliancePct).toBe(Math.round((7 / 13) * 100));
    expect(s.oosPct).toBe(Math.round((6 / 13) * 100));
  });
  it('ranks the most-missing mandatory SKUs', () => {
    const top = topMissingSkus(metrics);
    expect(top[0]).toEqual({ productId: 'p3', count: 2 }); // missing at c2 + c3
    expect(top.find((m) => m.productId === 'p4')!.count).toBe(2);
  });
  it('lists the dynamic dimensions present', () => {
    expect(availableDimensions(metrics).sort()).toEqual(['channel', 'region']);
  });
});
