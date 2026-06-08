import { describe, it, expect } from 'vitest';
import {
  PROMOTIONS_ENABLED,
  freeGoodsFor, tieredFreeGoods, freeGoodsReversal,
  isValidSplit, allocateFunding, reverseFunding,
  computeIncentives, reverseIncentives,
  computeCommission, commissionAdjustment,
  remainingBudget, checkSpend, utilisationPct,
  windowsOverlap, detectOverlaps, activeOn,
  buildClosureReport,
} from './index';

describe('promotion/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_PROMOTIONS;
    delete process.env.KAKO_PROMOTIONS;
    expect(PROMOTIONS_ENABLED()).toBe(false);
    process.env.KAKO_PROMOTIONS = '1';
    expect(PROMOTIONS_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_PROMOTIONS; else process.env.KAKO_PROMOTIONS = prev;
  });
});

describe('free-goods (buy X get Y + proportional reversal)', () => {
  it('computes free units + tiers', () => {
    expect(freeGoodsFor(100, { buyQty: 10, freeQty: 1 })).toBe(10);   // 10+1 → 10 free
    expect(freeGoodsFor(25, { buyQty: 10, freeQty: 2 })).toBe(4);     // 2 sets → 4 free
    expect(tieredFreeGoods(150, [{ minQty: 100, freeQty: 10 }, { minQty: 200, freeQty: 25 }])).toBe(10);
  });
  it('reverses free goods proportionally on return', () => {
    expect(freeGoodsReversal(100, 10, 20)).toBe(2);   // return 20 of 100 → 2 free back
    expect(freeGoodsReversal(200, 20, 50)).toBe(5);   // return 50 of 200 → 5 free back
  });
});

describe('funding split', () => {
  it('validates + allocates + reverses', () => {
    const shares = [{ source: 'supplier' as const, percent: 50 }, { source: 'company' as const, percent: 50 }];
    expect(isValidSplit(shares)).toBe(true);
    expect(isValidSplit([{ source: 'supplier' as const, percent: 60 }])).toBe(false);
    const alloc = allocateFunding(1000, shares);
    expect(alloc.map((a) => a.amount)).toEqual([500, 500]);
    expect(reverseFunding(alloc, 0.2).map((a) => a.amount)).toEqual([100, 100]);
  });
});

describe('incentives (unlimited layers)', () => {
  const layers = [
    { role: 'salesman', amount: 200 }, { role: 'supervisor', amount: 500 },
    { role: 'area_manager', amount: 1000 }, { role: 'regional_manager', amount: 2000 },
  ];
  it('pays every layer; scales achievement layers; reverses on return', () => {
    const payouts = computeIncentives(layers);
    expect(payouts.map((p) => p.net)).toEqual([200, 500, 1000, 2000]);
    const scaled = computeIncentives([{ role: 'salesman', amount: 200, achievementScaled: true }], { achievementPct: 50 });
    expect(scaled[0].gross).toBe(100);
    expect(computeIncentives(layers, { qualified: false }).every((p) => p.gross === 0)).toBe(true);
    expect(reverseIncentives(payouts, 0.25)[0].reversal).toBe(50);
  });
});

describe('commission engine', () => {
  it('fixed / percentage / tiered / achievement', () => {
    expect(computeCommission({ kind: 'fixed', amount: 100 }, 5000)).toBe(100);
    expect(computeCommission({ kind: 'percentage', percent: 2 }, 5000)).toBe(100);
    expect(computeCommission({ kind: 'achievement', percent: 2 }, 5000, 50)).toBe(50);
    expect(computeCommission({ kind: 'tiered', tiers: [{ minBase: 0, percent: 1 }, { minBase: 4000, percent: 3 }] }, 5000)).toBe(150);
  });
  it('adjusts/reverses on return', () => {
    const adj = commissionAdjustment({ kind: 'percentage', percent: 2 }, 5000, 4000);
    expect(adj.original).toBe(100);
    expect(adj.adjusted).toBe(80);
    expect(adj.reversal).toBe(20);
  });
});

describe('budget control', () => {
  it('computes remaining + prevents overspend', () => {
    const b = { amount: 10000, committed: 3000, actual: 4000 };
    expect(remainingBudget(b)).toBe(3000);
    expect(checkSpend(b, 2000).allowed).toBe(true);
    const over = checkSpend(b, 5000);
    expect(over.allowed).toBe(false);
    expect(over.overBy).toBe(2000);
    expect(utilisationPct(b)).toBe(70);
  });
});

describe('calendar + overlap detection', () => {
  const promos = [
    { id: 'P1', startDate: '2026-06-01', endDate: '2026-06-15', scopeKey: 'CUST1' },
    { id: 'P2', startDate: '2026-06-10', endDate: '2026-06-20', scopeKey: 'CUST1' },
    { id: 'P3', startDate: '2026-06-10', endDate: '2026-06-20', scopeKey: 'CUST2' },
  ];
  it('detects overlaps within scope + lists active', () => {
    expect(windowsOverlap(promos[0], promos[1])).toBe(true);
    expect(detectOverlaps(promos)).toEqual([['P1', 'P2']]);  // P3 is a different scope
    expect(activeOn(promos, '2026-06-12').map((p) => p.id).sort()).toEqual(['P1', 'P2', 'P3']);
  });
});

describe('closure report (reuses trade-spend ROI)', () => {
  it('builds incremental + ROI + cost ratios', () => {
    const r = buildClosureReport({
      promotionId: 'P1', startDate: '2026-06-01', endDate: '2026-06-30', budget: 10000, spend: 8000, marginPct: 25,
      before: { sales: 50000, volume: 1000, gp: 12500 },
      during: { sales: 90000, volume: 1800, gp: 22500 },
      after: { sales: 60000, volume: 1200, gp: 15000 },
      claims: 5000, incentivesPaid: 2000, commissionsPaid: 1000, customerCount: 40, skuCount: 5,
    });
    expect(r.incrementalSales).toBe(40000);
    expect(r.incrementalVolume).toBe(800);
    expect(r.roi.incrementalMargin).toBe(10000);   // 40000 * 25%
    expect(r.roi.netRoi).toBe(2000);               // 10000 - 8000
    expect(r.costPerCase).toBeCloseTo(8000 / 1800, 2);
    expect(r.costPerCustomer).toBe(200);
  });
});
