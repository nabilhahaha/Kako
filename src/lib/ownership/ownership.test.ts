import { describe, it, expect } from 'vitest';
import {
  ownerAt, currentOwner, historyFor, planOwnershipChange, findOverlaps, covers,
  type OwnershipRecord,
} from './index';

const records: OwnershipRecord[] = [
  { entityType: 'customer', entityId: 'C1', ownerType: 'salesman', ownerId: 'S1', effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: '2026-03-01T00:00:00Z' },
  { entityType: 'customer', entityId: 'C1', ownerType: 'salesman', ownerId: 'S2', effectiveFrom: '2026-03-01T00:00:00Z', effectiveTo: null },
  { entityType: 'customer', entityId: 'C1', ownerType: 'supervisor', ownerId: 'SUP1', effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null },
];

describe('ownership history — point-in-time attribution', () => {
  it('covers() respects [from, to)', () => {
    expect(covers(records[0], '2026-02-01T00:00:00Z')).toBe(true);
    expect(covers(records[0], '2026-03-01T00:00:00Z')).toBe(false); // exclusive end
  });

  it('ownerAt resolves the owner at execution time', () => {
    expect(ownerAt(records, 'customer', 'C1', 'salesman', '2026-02-15T00:00:00Z')).toBe('S1');
    expect(ownerAt(records, 'customer', 'C1', 'salesman', '2026-04-15T00:00:00Z')).toBe('S2');
    expect(ownerAt(records, 'customer', 'C1', 'salesman', '2025-12-01T00:00:00Z')).toBeNull();
    expect(ownerAt(records, 'customer', 'C1', 'supervisor', '2026-06-01T00:00:00Z')).toBe('SUP1');
  });

  it('currentOwner returns the open interval', () => {
    expect(currentOwner(records, 'customer', 'C1', 'salesman')).toBe('S2');
  });

  it('historyFor returns chronological history', () => {
    const h = historyFor(records, 'customer', 'C1', 'salesman');
    expect(h.map((r) => r.ownerId)).toEqual(['S1', 'S2']);
  });

  it('planOwnershipChange closes the open interval + opens a new one (never overwrites)', () => {
    const plan = planOwnershipChange(records, 'customer', 'C1', 'salesman', 'S3', '2026-05-01T00:00:00Z', 'territory rebalance');
    expect(plan.close!.record.ownerId).toBe('S2');
    expect(plan.close!.effectiveTo).toBe('2026-05-01T00:00:00Z');
    expect(plan.open.ownerId).toBe('S3');
    expect(plan.open.effectiveTo).toBeNull();
    expect(plan.open.reason).toBe('territory rebalance');
  });

  it('findOverlaps flags double-open intervals', () => {
    expect(findOverlaps(records)).toEqual([]);
    const bad = [...records, { entityType: 'customer', entityId: 'C1', ownerType: 'salesman', ownerId: 'SX', effectiveFrom: '2026-04-01T00:00:00Z', effectiveTo: null } as OwnershipRecord];
    expect(findOverlaps(bad).length).toBeGreaterThan(0);
  });
});
