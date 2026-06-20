import { describe, it, expect } from 'vitest';
import {
  buildTisCustomer,
  buildTisDataset,
  isValidGeo,
  customerWorkload,
  validateTisCustomer,
  coverageOf,
  hasGeo,
  hasFrequency,
  type TisCustomer,
} from './dataset';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const triWeekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 3 };

describe('isValidGeo', () => {
  it('accepts valid points, rejects out-of-range / null-island / null', () => {
    expect(isValidGeo({ lat: 24.7, lng: 46.7 })).toBe(true);
    expect(isValidGeo({ lat: 0, lng: 0 })).toBe(false);       // null island
    expect(isValidGeo({ lat: 200, lng: 46 })).toBe(false);    // out of range
    expect(isValidGeo(null)).toBe(false);
  });
});

describe('buildTisCustomer', () => {
  it('fills defaults + normalizes (ownership, grade case, invalid geo dropped)', () => {
    const c = buildTisCustomer({ id: 'c1', name: 'Shop', grade: 'A', geo: { lat: 0, lng: 0 } });
    expect(c.ownership).toEqual({ salesmanId: null, supervisorId: null, areaId: null, regionId: null, routeId: null });
    expect(c.grade).toBe('a');
    expect(c.geo).toBeNull(); // null-island dropped
    expect(c.frequency).toBeNull();
  });
  it('keeps a valid geo + partial ownership', () => {
    const c = buildTisCustomer({ id: 'c2', name: 'B', geo: { lat: 24.7, lng: 46.7 }, ownership: { salesmanId: 's1' } as never });
    expect(c.geo).toEqual({ lat: 24.7, lng: 46.7 });
    expect(c.ownership.salesmanId).toBe('s1');
    expect(c.ownership.routeId).toBeNull();
  });
  it('drops non-finite sales/health', () => {
    const c = buildTisCustomer({ id: 'c3', name: 'C', salesValue: NaN, health: Infinity });
    expect(c.salesValue).toBeNull();
    expect(c.health).toBeNull();
  });
});

describe('customerWorkload', () => {
  it('derives visits/week from frequency, null when absent', () => {
    expect(customerWorkload(buildTisCustomer({ id: 'a', name: 'A', frequency: triWeekly }))).toBe(3);
    expect(customerWorkload(buildTisCustomer({ id: 'b', name: 'B', frequency: weekly }))).toBe(1);
    expect(customerWorkload(buildTisCustomer({ id: 'c', name: 'C' }))).toBeNull();
  });
});

describe('validateTisCustomer', () => {
  it('flags missing identity + bad health', () => {
    expect(validateTisCustomer({ ...buildTisCustomer({ id: 'x', name: 'X' }), health: 250 })).toContain('health_out_of_range');
    const bad = { ...buildTisCustomer({ id: 'x', name: 'X' }), id: '', name: ' ' } as TisCustomer;
    expect(validateTisCustomer(bad)).toEqual(expect.arrayContaining(['missing_id', 'missing_name']));
  });
  it('clean customer ⇒ no issues', () => {
    expect(validateTisCustomer(buildTisCustomer({ id: 'ok', name: 'OK', geo: { lat: 24.7, lng: 46.7 } }))).toEqual([]);
  });
});

describe('buildTisDataset + coverageOf', () => {
  const ds = buildTisDataset([
    buildTisCustomer({ id: 'a', name: 'A', geo: { lat: 24.7, lng: 46.7 }, frequency: weekly }),
    buildTisCustomer({ id: 'b', name: 'B', geo: { lat: 24.8, lng: 46.8 } }),
    buildTisCustomer({ id: 'c', name: 'C' }),
  ], { source: 'upload', asOf: '2026-06-19' });

  it('carries meta + customers', () => {
    expect(ds.source).toBe('upload');
    expect(ds.asOf).toBe('2026-06-19');
    expect(ds.customers).toHaveLength(3);
  });
  it('coverageOf reports the present-field fraction', () => {
    expect(coverageOf(ds, hasGeo)).toBeCloseTo(2 / 3, 5);
    expect(coverageOf(ds, hasFrequency)).toBeCloseTo(1 / 3, 5);
    expect(coverageOf(buildTisDataset([]), hasGeo)).toBe(0);
  });
});
