import { describe, it, expect } from 'vitest';
import {
  SUGGESTED_LOAD_ENABLED,
  projectSkuDemand, projectRouteDemand,
  suggestLoadLine, suggestLoad, replenishmentRecommendations, vanUtilization,
} from './index';

describe('suggested-load/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_SUGGESTED_LOAD;
    delete process.env.KAKO_SUGGESTED_LOAD;
    expect(SUGGESTED_LOAD_ENABLED()).toBe(false);
    process.env.KAKO_SUGGESTED_LOAD = '1';
    expect(SUGGESTED_LOAD_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_SUGGESTED_LOAD; else process.env.KAKO_SUGGESTED_LOAD = prev;
  });
});

describe('demand projection (reuses 6B forecasting)', () => {
  it('projects per-SKU demand with drivers + active-customer scaling', () => {
    expect(projectSkuDemand({ productId: 'P1', history: [100, 100, 100] })).toBe(100);
    expect(projectSkuDemand({ productId: 'P1', history: [100, 100, 100], drivers: { promotionUpliftPct: 20 } })).toBe(120);
    expect(projectSkuDemand({ productId: 'P1', history: [100, 100, 100], activeCustomerRatio: 0.5 })).toBe(50);
    expect(projectRouteDemand([{ productId: 'A', history: [10, 10] }, { productId: 'B', history: [20, 20] }])).toEqual([
      { productId: 'A', demand: 10 }, { productId: 'B', demand: 20 },
    ]);
  });
});

describe('suggested load + replenishment', () => {
  it('suggests ceil(demand×(1+buffer) − on-van), floored at 0', () => {
    // target = 100*1.1 = 110 ; on-van 30 → suggest 80
    expect(suggestLoadLine({ productId: 'P1', projectedDemand: 100, currentVanStock: 30 }).suggestedLoad).toBe(80);
    // already overstocked → 0
    expect(suggestLoadLine({ productId: 'P2', projectedDemand: 50, currentVanStock: 100 }).suggestedLoad).toBe(0);
    // custom buffer
    expect(suggestLoadLine({ productId: 'P3', projectedDemand: 100, currentVanStock: 0, safetyPct: 25 }).suggestedLoad).toBe(125);
  });
  it('builds the sheet + replenishment recs (biggest gap first)', () => {
    const load = suggestLoad([
      { productId: 'A', projectedDemand: 100, currentVanStock: 30 },  // 80
      { productId: 'B', projectedDemand: 50, currentVanStock: 100 },  // 0
      { productId: 'C', projectedDemand: 200, currentVanStock: 0 },   // 220
    ]);
    expect(load.totalSuggestedUnits).toBe(300);
    expect(replenishmentRecommendations(load).map((l) => l.productId)).toEqual(['C', 'A']);
  });
});

describe('van utilization vs capacity', () => {
  it('computes units/weight/volume % + within-capacity', () => {
    const items = [{ productId: 'A', qty: 100, unitWeightKg: 1, unitVolumeM3: 0.01 }, { productId: 'B', qty: 50, unitWeightKg: 2 }];
    const u = vanUtilization(items, { units: 200, weightKg: 250, volumeM3: 2 });
    expect(u.units).toBe(150);
    expect(u.weightKg).toBe(200);          // 100*1 + 50*2
    expect(u.unitsPct).toBe(75);
    expect(u.weightPct).toBe(80);
    expect(u.withinCapacity).toBe(true);
    expect(vanUtilization(items, { units: 100 }).withinCapacity).toBe(false); // 150 > 100
  });
});
