import { describe, it, expect } from 'vitest';
import {
  suggestDpMapping,
  validateDpImport,
  headersFingerprint,
  mappingMatchScore,
  isValidLatLng,
  DP_REQUIRED_FIELDS,
} from './day-planner-import';

describe('day-planner-import — auto mapping', () => {
  it('auto-detects common English headers', () => {
    const m = suggestDpMapping(['Outlet Name', 'GPS Lat', 'GPS Long', 'Account', 'Mobile', 'Town', 'Sales Rep']);
    expect(m.name).toBe('Outlet Name');
    expect(m.lat).toBe('GPS Lat');
    expect(m.lng).toBe('GPS Long');
    expect(m.code).toBe('Account');
    expect(m.phone).toBe('Mobile');
    expect(m.city).toBe('Town');
    expect(m.salesman).toBe('Sales Rep');
  });

  it('maps the spec aliases (customer/name/outlet/client, lat/lng x/y, etc.)', () => {
    expect(suggestDpMapping(['client']).name).toBe('client');
    expect(suggestDpMapping(['Y']).lat).toBe('Y');
    expect(suggestDpMapping(['X']).lng).toBe('X');
    expect(suggestDpMapping(['cust code']).code).toBe('cust code');
    expect(suggestDpMapping(['whatsapp']).phone).toBe('whatsapp');
    expect(suggestDpMapping(['manager']).supervisor).toBe('manager');
  });

  it('detects Arabic headers', () => {
    const m = suggestDpMapping(['اسم العميل', 'خط العرض', 'خط الطول', 'الجوال', 'المدينة']);
    expect(m.name).toBe('اسم العميل');
    expect(m.lat).toBe('خط العرض');
    expect(m.lng).toBe('خط الطول');
    expect(m.phone).toBe('الجوال');
    expect(m.city).toBe('المدينة');
  });

  it('never assigns one header to two fields', () => {
    const m = suggestDpMapping(['name', 'lat', 'lng']);
    const used = Object.values(m);
    expect(new Set(used).size).toBe(used.length);
  });

  it('required fields are name/lat/lng', () => {
    expect(DP_REQUIRED_FIELDS).toEqual(['name', 'lat', 'lng']);
  });
});

describe('day-planner-import — validation', () => {
  const recs = [
    { Name: 'Alpha', Lat: '21.5', Lng: '39.1', Code: 'A1' },
    { Name: 'Beta', Lat: '', Lng: '39.2', Code: 'B2' },          // missing coord
    { Name: 'Gamma', Lat: '999', Lng: '39.3', Code: 'G3' },      // invalid (out of range)
    { Name: 'Delta', Lat: '0', Lng: '0', Code: 'D4' },           // invalid (null island)
    { Name: 'Alpha again', Lat: '21.6', Lng: '39.4', Code: 'A1' }, // duplicate code
    { Name: 'Echo', Lat: '21.7', Lng: '39.5', Code: 'E5' },
    { Name: 'Foxtrot', Lat: 'abc', Lng: '39.6', Code: 'F6' },    // invalid (non-numeric)
  ];
  const mapping = { name: 'Name', lat: 'Lat', lng: 'Lng', code: 'Code' } as const;

  it('classifies every row with correct tallies', () => {
    const v = validateDpImport(recs, mapping);
    expect(v.total).toBe(7);
    expect(v.valid).toBe(2); // Alpha, Echo (Foxtrot is invalid)
    expect(v.missingCoords).toBe(1);
    expect(v.invalidCoords).toBe(3); // Gamma, Delta, Foxtrot
    expect(v.duplicates).toBe(1);    // Alpha again
    expect(v.skipped).toBe(5);
    expect(v.valid + v.skipped).toBe(v.total);
  });

  it('keeps the clean customers with parsed coordinates', () => {
    const v = validateDpImport(recs, mapping);
    expect(v.customers.map((c) => c.code)).toEqual(['A1', 'E5']);
    expect(v.customers[0]).toMatchObject({ name: 'Alpha', lat: 21.5, lng: 39.1 });
  });

  it('records rejected rows with reasons and 1-based row numbers', () => {
    const v = validateDpImport(recs, mapping);
    expect(v.rejected).toEqual([
      { row: 2, name: 'Beta', code: 'B2', reason: 'missing_coords' },
      { row: 3, name: 'Gamma', code: 'G3', reason: 'invalid_coords' },
      { row: 4, name: 'Delta', code: 'D4', reason: 'invalid_coords' },
      { row: 5, name: 'Alpha again', code: 'A1', reason: 'duplicate' },
      { row: 7, name: 'Foxtrot', code: 'F6', reason: 'invalid_coords' },
    ]);
  });

  it('carries optional fields when mapped', () => {
    const v = validateDpImport(
      [{ N: 'Shop', LA: '21', LO: '39', PH: '0555', NT: 'VIP' }],
      { name: 'N', lat: 'LA', lng: 'LO', phone: 'PH', notes: 'NT' },
    );
    expect(v.customers[0]).toMatchObject({ phone: '0555', notes: 'VIP' });
  });

  it('dedupes by name+coords when there is no code', () => {
    const v = validateDpImport(
      [{ N: 'Shop', LA: '21.50000', LO: '39.10000' }, { N: 'Shop', LA: '21.5', LO: '39.1' }],
      { name: 'N', lat: 'LA', lng: 'LO' },
    );
    expect(v.valid).toBe(1);
    expect(v.duplicates).toBe(1);
  });
});

describe('day-planner-import — templates', () => {
  it('fingerprint is order-insensitive and normalised', () => {
    expect(headersFingerprint(['Customer Name', 'Lat', 'Lng']))
      .toBe(headersFingerprint(['lng', 'lat', 'customer_name']));
  });

  it('match score rewards overlapping columns', () => {
    expect(mappingMatchScore(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(mappingMatchScore(['a', 'b', 'c', 'd'], ['a', 'b'])).toBeCloseTo(0.5);
    expect(mappingMatchScore(['a'], ['x', 'y'])).toBe(0);
  });

  it('isValidLatLng range checks', () => {
    expect(isValidLatLng(21.5, 39.1)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(isValidLatLng(91, 39)).toBe(false);
    expect(isValidLatLng(21, 181)).toBe(false);
    expect(isValidLatLng(null, 39)).toBe(false);
  });
});
