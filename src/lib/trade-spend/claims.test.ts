import { describe, it, expect } from 'vitest';
import { settleClaim } from './claims';

const promos = [
  { id: 'P1', accruedBalance: 100, date: '2026-01-01' },
  { id: 'P2', accruedBalance: 50, date: '2026-02-01' },
];

describe('trade-spend claims/deductions settlement engine', () => {
  it('settles a claim oldest-first across accrued promos', () => {
    const r = settleClaim(120, promos);
    expect(r.allocations).toEqual([{ promoId: 'P1', applied: 100 }, { promoId: 'P2', applied: 20 }]);
    expect(r.totalApplied).toBe(120);
    expect(r.overClaim).toBe(0);
    expect(r.fullyConsumed).toEqual(['P1']);
  });

  it('flags the unbacked portion as overClaim (dispute/hold)', () => {
    const r = settleClaim(200, promos); // only 150 accrued
    expect(r.totalApplied).toBe(150);
    expect(r.overClaim).toBe(50);
    expect(r.fullyConsumed).toEqual(['P1', 'P2']);
  });

  it('never settles more than a promo accrued balance', () => {
    const r = settleClaim(999, [{ id: 'P1', accruedBalance: 30, date: '2026-01-01' }], { specified: { P1: 999 } });
    expect(r.allocations).toEqual([{ promoId: 'P1', applied: 30 }]);
    expect(r.overClaim).toBe(969);
  });

  it('honours specified per-promo amounts and clamps to the claim total', () => {
    const r = settleClaim(120, promos, { specified: { P1: 100, P2: 50 } });
    // P1 100 then P2 clamped to remaining 20
    expect(r.allocations).toEqual([{ promoId: 'P1', applied: 100 }, { promoId: 'P2', applied: 20 }]);
    expect(r.totalApplied).toBe(120);
  });

  it('ignores promos with no accrued balance and unknown ids', () => {
    const r = settleClaim(40, [{ id: 'Z', accruedBalance: 0, date: '2025-01-01' }, ...promos], { specified: { NOPE: 10, P2: 40 } });
    expect(r.allocations).toEqual([{ promoId: 'P2', applied: 40 }]);
  });

  it('handles a zero/negative claim safely', () => {
    expect(settleClaim(0, promos)).toMatchObject({ totalApplied: 0, overClaim: 0, allocations: [] });
    expect(settleClaim(-50, promos)).toMatchObject({ totalApplied: 0, overClaim: 0 });
  });
});
