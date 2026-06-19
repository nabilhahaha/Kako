import { describe, it, expect } from 'vitest';
import { rowToTisCustomer, buildTisDatasetFromRows } from './upload';
import { resolveCapabilities } from './capabilities';
import { customerWorkload } from './dataset';

describe('rowToTisCustomer', () => {
  it('maps a full row + coerces frequency + parses geo', () => {
    const c = rowToTisCustomer({
      id: 'C1', code: 'C1', name: 'Al-Noor', lat: '24.7', lng: '46.7',
      salesmanId: 's1', routeId: 'R1', grade: 'A', frequency: 'fortnightly', salesValue: '1500', coverage: 'on_track',
    });
    expect(c.geo).toEqual({ lat: 24.7, lng: 46.7 });
    expect(c.grade).toBe('a');
    expect(c.frequency).toEqual({ unit: 'week', everyN: 2, visitsPerCycle: 1 }); // fortnightly → biweekly
    expect(c.salesValue).toBe(1500);
    expect(c.coverage).toBe('on_track');
    expect(c.ownership.salesmanId).toBe('s1');
  });
  it('synthesizes id + tolerates missing fields; bad frequency ⇒ null', () => {
    const c = rowToTisCustomer({ name: 'NoId', frequency: 'whenever' }, 4);
    expect(c.id).toBe('row-5');
    expect(c.geo).toBeNull();
    expect(c.frequency).toBeNull();
    expect(c.coverage).toBeNull();
  });
  it('reads a bare integer frequency as visits/week', () => {
    expect(customerWorkload(rowToTisCustomer({ name: 'X', frequency: '3' }))).toBe(3);
  });
});

describe('buildTisDatasetFromRows', () => {
  it('builds a Mode-A dataset (geo + frequency, no coverage)', () => {
    const ds = buildTisDatasetFromRows([
      { name: 'A', lat: 24.7, lng: 46.7, frequency: 'weekly', grade: 'a' },
      { name: 'B', lat: 24.8, lng: 46.8, frequency: 'monthly', grade: 'c' },
    ], { source: 'sheets' });
    expect(ds.source).toBe('sheets');
    expect(ds.customers).toHaveLength(2);
    const cap = resolveCapabilities(ds);
    expect(cap.mode).toBe('A');
    expect(cap.capabilities.routeOptimization).toBe(true);
    expect(cap.capabilities.coverageOverlay).toBe(false);
  });
});
