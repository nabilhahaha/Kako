import { describe, it, expect } from 'vitest';
import {
  serializeAssignments, deserializeAssignments, serializeFrequencies,
  dailyVisitPlanFromJourney, dayCounts, JOURNEY_DAYS, type StoredAssignment,
} from './route-planner-daily-plan';

const A = (customerId: string, days: string[], weeks = [1, 2, 3, 4]): StoredAssignment => ({
  customerId, frequency: 'w1', days, weeks, visitCount: days.length * weeks.length,
});

describe('route-planner-daily-plan — serialization round-trip', () => {
  it('serializes and rebuilds the assignments map', () => {
    const m = new Map<string, StoredAssignment>([['c1', A('c1', ['sat'])], ['c2', A('c2', ['sun', 'mon'])]]);
    const obj = serializeAssignments(m);
    expect(obj.c1.days).toEqual(['sat']);
    const back = deserializeAssignments(obj);
    expect(back.get('c2')?.days).toEqual(['sun', 'mon']);
    expect(back.size).toBe(2);
  });

  it('serializes a frequency map to an object', () => {
    const f = new Map([['c1', 'w1'], ['c2', 'w2']]);
    expect(serializeFrequencies(f)).toEqual({ c1: 'w1', c2: 'w2' });
  });

  it('deserialize tolerates null/empty', () => {
    expect(deserializeAssignments(null).size).toBe(0);
    expect(deserializeAssignments(undefined).size).toBe(0);
  });
});

describe('route-planner-daily-plan — daily visit plan derivation', () => {
  const customers = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }];
  const assignments = {
    c1: A('c1', ['sat', 'tue']),
    c2: A('c2', ['sun']),
    c3: A('c3', ['sat']),
    c4: A('c4', ['mon'], [1, 3]),
  };

  it('returns only customers scheduled on the given day, in input order', () => {
    const sat = dailyVisitPlanFromJourney(assignments, customers, 'sat');
    expect(sat.map((s) => s.customer.id)).toEqual(['c1', 'c3']);   // c1 before c3 (input order)
  });

  it('carries the cycle weeks for each stop', () => {
    const mon = dailyVisitPlanFromJourney(assignments, customers, 'mon');
    expect(mon).toHaveLength(1);
    expect(mon[0].customer.id).toBe('c4');
    expect(mon[0].weeks).toEqual([1, 3]);
  });

  it('returns empty for a day with no visits', () => {
    expect(dailyVisitPlanFromJourney(assignments, customers, 'thu')).toEqual([]);
  });

  it('accepts a Map as well as a plain object', () => {
    const m = deserializeAssignments(assignments);
    expect(dailyVisitPlanFromJourney(m, customers, 'sun').map((s) => s.customer.id)).toEqual(['c2']);
  });

  it('dayCounts tallies customers per working day', () => {
    const counts = dayCounts(assignments);
    expect(counts.sat).toBe(2);
    expect(counts.sun).toBe(1);
    expect(counts.tue).toBe(1);
    expect(counts.wed).toBe(0);
    expect(JOURNEY_DAYS.reduce((a, d) => a + counts[d], 0)).toBe(5); // c1(2)+c2(1)+c3(1)+c4(1)
  });
});
