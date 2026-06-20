import { describe, it, expect } from 'vitest';
import { rowToTisCustomer, buildTisDatasetFromRows, mapRecordsToUploadRows } from './upload';
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

describe('mapRecordsToUploadRows (tolerant headers)', () => {
  it('maps aliased / cased / spaced headers onto canonical fields', () => {
    const rows = mapRecordsToUploadRows([
      { 'Customer Name': 'Al-Noor', Latitude: '24.7', Longitude: '46.7', Rep: 's1', Route: 'R1', Cadence: 'weekly', Sales: '1500', Class: 'A' },
    ]);
    expect(rows[0]).toMatchObject({ name: 'Al-Noor', lat: '24.7', lng: '46.7', salesmanId: 's1', routeId: 'R1', frequency: 'weekly', salesValue: '1500', grade: 'A' });
  });
  it('ignores unknown columns and blanks → null', () => {
    const rows = mapRecordsToUploadRows([{ name: 'X', Notes: 'ignore me', lat: '' }]);
    expect(rows[0].name).toBe('X');
    expect(rows[0].lat).toBeNull();
    expect('Notes' in rows[0]).toBe(false);
  });
  it('round-trips through buildTisDatasetFromRows', () => {
    const rows = mapRecordsToUploadRows([{ Name: 'A', latitude: '24.7', longitude: '46.7', frequency: 'weekly' }]);
    const ds = buildTisDatasetFromRows(rows);
    expect(ds.customers).toHaveLength(1);
    expect(ds.customers[0].geo).toEqual({ lat: 24.7, lng: 46.7 });
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
