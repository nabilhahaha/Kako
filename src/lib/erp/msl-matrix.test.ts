import { describe, it, expect } from 'vitest';
import {
  policyActiveAt, policyMatchesOutlet, resolveMslForOutlet, requiredProductIds,
  type MslPolicy, type Lookup, type MslLevel,
} from './msl-matrix';

// Dynamic, company-defined dimensions — nothing hardcoded. Two dimensions here
// ('channel' and 'class') but the engine treats kinds as opaque strings, so a
// company could add 'sub_channel', 'brand', etc. with no code change.
const lookups: Lookup[] = [
  { id: 'ch-modern', kind: 'channel' },
  { id: 'ch-trad', kind: 'channel' },
  { id: 'cls-a', kind: 'class' },
  { id: 'cls-b', kind: 'class' },
  { id: 'sub-grocery', kind: 'sub_channel' }, // a dimension the engine never names
];
const kindOf = new Map(lookups.map((l) => [l.id, l.kind]));
const levels: MslLevel[] = [{ id: 'lvl-core', weight: 3 }, { id: 'lvl-ext', weight: 1 }];

describe('msl-matrix · policyActiveAt', () => {
  it('honours enable/disable and effective window', () => {
    const p = (o: Partial<MslPolicy>): MslPolicy => ({ id: 'p', conditionLookupIds: [], items: [], ...o });
    expect(policyActiveAt(p({ isActive: false }), '2026-06-01')).toBe(false);
    expect(policyActiveAt(p({ effectiveFrom: '2026-06-10' }), '2026-06-01')).toBe(false);
    expect(policyActiveAt(p({ effectiveTo: '2026-05-31' }), '2026-06-01')).toBe(false);
    expect(policyActiveAt(p({ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }), '2026-06-01')).toBe(true);
  });
});

describe('msl-matrix · policyMatchesOutlet', () => {
  const outlet = new Set(['ch-modern', 'cls-a', 'sub-grocery']);
  it('no conditions → company-wide match', () => {
    expect(policyMatchesOutlet({ id: 'p', conditionLookupIds: [], items: [] }, outlet, kindOf)).toBe(true);
  });
  it('AND across kinds, OR within a kind', () => {
    // channel ∈ {modern,trad} AND class ∈ {a} → matches (modern + a)
    expect(policyMatchesOutlet({ id: 'p', conditionLookupIds: ['ch-modern', 'ch-trad', 'cls-a'], items: [] }, outlet, kindOf)).toBe(true);
    // class ∈ {b} only → outlet is class a → no match
    expect(policyMatchesOutlet({ id: 'p', conditionLookupIds: ['cls-b'], items: [] }, outlet, kindOf)).toBe(false);
    // a dynamic third dimension still works with zero code changes
    expect(policyMatchesOutlet({ id: 'p', conditionLookupIds: ['sub-grocery'], items: [] }, outlet, kindOf)).toBe(true);
  });
});

describe('msl-matrix · resolveMslForOutlet', () => {
  const outlet = { customerId: 'c1', lookupIds: ['ch-modern', 'cls-a'] };
  const policies: MslPolicy[] = [
    { id: 'base', priority: 0, conditionLookupIds: [], items: [
      { productId: 'p1', levelId: 'lvl-core' }, { productId: 'p2', levelId: 'lvl-ext' },
    ] },
    { id: 'modern-a', priority: 10, conditionLookupIds: ['ch-modern', 'cls-a'], items: [
      { productId: 'p2', levelId: 'lvl-core' }, // higher priority overrides p2 weight
      { productId: 'p3', weight: 5 },           // explicit weight override
      { productId: 'p4', levelId: 'lvl-ext', isActive: false }, // disabled item skipped
    ] },
    { id: 'trad-only', priority: 99, conditionLookupIds: ['ch-trad'], items: [
      { productId: 'p9', levelId: 'lvl-core' }, // does not apply to a modern outlet
    ] },
  ];

  it('unions matching policies, applies weights, and lets priority win conflicts', () => {
    const resolved = resolveMslForOutlet(policies, outlet, lookups, levels, '2026-06-01');
    expect([...requiredProductIds(resolved)].sort()).toEqual(['p1', 'p2', 'p3']);
    expect(resolved.get('p1')!.weight).toBe(3);  // core level
    expect(resolved.get('p2')!.weight).toBe(3);  // overridden to core by higher-priority policy
    expect(resolved.get('p2')!.policyId).toBe('modern-a');
    expect(resolved.get('p3')!.weight).toBe(5);  // explicit override
    expect(resolved.has('p9')).toBe(false);      // trad-only policy excluded
    expect(resolved.has('p4')).toBe(false);      // disabled item
  });

  it('excludes policies outside their effective window', () => {
    const dated: MslPolicy[] = [{ id: 'expired', priority: 0, effectiveTo: '2026-01-01', conditionLookupIds: [], items: [{ productId: 'pE' }] }];
    const resolved = resolveMslForOutlet(dated, outlet, lookups, levels, '2026-06-01');
    expect(resolved.size).toBe(0);
  });
});
