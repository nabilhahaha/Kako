import { describe, it, expect } from 'vitest';
import { detectPlanConflicts, totalScheduledStops, type ExistingPlanRow } from './proposal';
import type { DayPlan } from '@/lib/route-optimization/generator';

const dp = (day: string, customerIds: string[]): DayPlan => ({
  day,
  customerIds,
  route: { order: [], totalDistanceM: 0, backtrackingM: 0, stopCount: customerIds.length, mode: 'optimized' },
});

describe('detectPlanConflicts', () => {
  it('flags a (customer, day) already present in existing journey plans', () => {
    const plans = [dp('sun', ['c1', 'c2']), dp('tue', ['c1'])];
    const existing: ExistingPlanRow[] = [{ customer_id: 'c1', day_of_week: 'sun', route_id: 'r9' }];
    expect(detectPlanConflicts(plans, existing)).toEqual([{ customerId: 'c1', day: 'sun' }]);
  });

  it('no conflict when day differs', () => {
    const plans = [dp('mon', ['c1'])];
    const existing: ExistingPlanRow[] = [{ customer_id: 'c1', day_of_week: 'sun', route_id: null }];
    expect(detectPlanConflicts(plans, existing)).toEqual([]);
  });

  it('empty existing → no conflicts', () => {
    expect(detectPlanConflicts([dp('sun', ['c1'])], [])).toEqual([]);
  });
});

describe('totalScheduledStops', () => {
  it('sums per-day customer counts', () => {
    expect(totalScheduledStops([dp('sun', ['a', 'b']), dp('tue', ['a'])])).toBe(3);
  });
});
