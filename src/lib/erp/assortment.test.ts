import { describe, it, expect } from 'vitest';
import {
  outletCompliance, weightedOutletCompliance, summarizeCompliance, complianceBand,
} from './assortment';

describe('assortment · outletCompliance', () => {
  it('counts present vs missing required products', () => {
    const required = new Set(['p1', 'p2', 'p3']);
    const present = new Set(['p1', 'p3', 'pZ']);
    const c = outletCompliance('c1', required, present);
    expect(c.required).toBe(3);
    expect(c.present).toBe(2);
    expect(c.missing).toBe(1);
    expect(c.missingProductIds).toEqual(['p2']);
    expect(c.compliancePct).toBe(67);
  });
  it('100% when nothing is required', () => {
    expect(outletCompliance('c1', new Set(), new Set()).compliancePct).toBe(100);
  });
});

describe('assortment · weightedOutletCompliance', () => {
  it('weights missing core SKUs more than extended ones', () => {
    // core p1(w3), p2(w3) present; extended p3(w1) missing
    const req = new Map([['p1', 3], ['p2', 3], ['p3', 1]]);
    const c = weightedOutletCompliance('c1', req, new Set(['p1', 'p2']));
    expect(c.compliancePct).toBe(67);                 // 2/3 by count
    expect(c.weightedPct).toBe(Math.round((6 / 7) * 100)); // 86 by weight
  });
  it('100% weighted when nothing required', () => {
    expect(weightedOutletCompliance('c1', new Map(), new Set()).weightedPct).toBe(100);
  });
});

describe('assortment · summarizeCompliance + band', () => {
  it('aggregates compliance, gaps and fully-compliant outlets', () => {
    const rows = [
      outletCompliance('c1', new Set(['p1', 'p2']), new Set(['p1', 'p2'])), // full
      outletCompliance('c2', new Set(['p1', 'p2']), new Set(['p1'])),       // 1 gap
      outletCompliance('c3', new Set(), new Set()),                          // no MSL
    ];
    const s = summarizeCompliance(rows);
    expect(s.outlets).toBe(2);            // c3 has no MSL → not counted
    expect(s.totalRequired).toBe(4);
    expect(s.totalPresent).toBe(3);
    expect(s.gapLines).toBe(1);
    expect(s.fullyCompliantOutlets).toBe(1);
    expect(s.compliancePct).toBe(75);
  });
  it('bands by threshold', () => {
    expect(complianceBand(95)).toBe('good');
    expect(complianceBand(75)).toBe('attention');
    expect(complianceBand(40)).toBe('critical');
  });
});
