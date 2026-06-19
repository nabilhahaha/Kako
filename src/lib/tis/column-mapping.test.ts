import { describe, it, expect } from 'vitest';
import { suggestColumnMapping, applyColumnMapping, buildTisDatasetFromRows, TIS_MAP_FIELDS } from './upload';

describe('suggestColumnMapping', () => {
  it('auto-detects English synonyms, GPS-prefixed, Y/X and underscores', () => {
    const m = suggestColumnMapping(['Customer_Name', 'GPS Latitude', 'GPS Longitude', 'Account Code', 'Route', 'Visit Frequency']);
    expect(m.name).toBe('Customer_Name');
    expect(m.lat).toBe('GPS Latitude');
    expect(m.lng).toBe('GPS Longitude');
    expect(m.code).toBe('Account Code');
    expect(m.route).toBe('Route');
    expect(m.frequency).toBe('Visit Frequency');
  });

  it('detects short forms Lat/Lng/Y/X and Customer/Name', () => {
    expect(suggestColumnMapping(['Name', 'Lat', 'Lng']).name).toBe('Name');
    expect(suggestColumnMapping(['Name', 'Lat', 'Lng']).lat).toBe('Lat');
    expect(suggestColumnMapping(['Customer', 'Y', 'X']).lng).toBe('X');
    expect(suggestColumnMapping(['Customer', 'Y', 'X']).lat).toBe('Y');
  });

  it('detects Arabic headers', () => {
    const m = suggestColumnMapping(['اسم العميل', 'خط العرض', 'خط الطول', 'كود العميل']);
    expect(m.name).toBe('اسم العميل');
    expect(m.lat).toBe('خط العرض');
    expect(m.lng).toBe('خط الطول');
    expect(m.code).toBe('كود العميل');
  });

  it('leaves a field unmapped when no header matches', () => {
    const m = suggestColumnMapping(['Foo', 'Bar']);
    expect(m.name).toBeUndefined();
  });
});

describe('applyColumnMapping', () => {
  const records = [
    { Outlet: 'Shop A', Y: '21.5', X: '39.1', Acc: 'C001', Trip: 'R-1', Cad: 'weekly', Rep: 'sm-1', Br: 'Jeddah DC', Town: 'Jeddah', Ch: 'mini_market', Tier: 'a', Addr: 'King Rd' },
  ];
  const mapping = {
    name: 'Outlet', lat: 'Y', lng: 'X', code: 'Acc', route: 'Trip', frequency: 'Cad',
    salesman: 'Rep', branch: 'Br', city: 'Town', channel: 'Ch', class: 'Tier', address: 'Addr',
  } as const;

  it('builds canonical upload rows from an explicit mapping', () => {
    const rows = applyColumnMapping(records, mapping);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.name).toBe('Shop A');
    expect(r.lat).toBe('21.5');
    expect(r.lng).toBe('39.1');
    expect(r.code).toBe('C001');
    expect(r.routeId).toBe('R-1');
    expect(r.frequency).toBe('weekly');
    expect(r.salesmanId).toBe('sm-1');
    expect(r.branch).toBe('Jeddah DC');
    expect(r.city).toBe('Jeddah');
    expect(r.channel).toBe('mini_market');
    expect(r.grade).toBe('a'); // the column "Tier" holds value 'a'; grade kept as-is on the row
    expect(r.address).toBe('King Rd');
  });

  it('feeds buildTisDatasetFromRows → a valid customer with metadata', () => {
    const ds = buildTisDatasetFromRows(applyColumnMapping(records, mapping), { source: 'upload' });
    expect(ds.customers).toHaveLength(1);
    const c = ds.customers[0];
    expect(c.name).toBe('Shop A');
    expect(c.geo).toEqual({ lat: 21.5, lng: 39.1 });
    expect(c.ownership.routeId).toBe('R-1');
    expect(c.ownership.salesmanId).toBe('sm-1');
    expect(c.grade).toBe('a'); // lowercased by buildTisCustomer
    expect(c.channel).toBe('mini_market');
    expect(c.branch).toBe('Jeddah DC');
    expect(c.city).toBe('Jeddah');
    expect(c.address).toBe('King Rd');
  });

  it('ignores unmapped fields (left empty)', () => {
    const rows = applyColumnMapping(records, { name: 'Outlet', lat: 'Y', lng: 'X' });
    expect(rows[0].code).toBeUndefined();
    expect(rows[0].routeId).toBeUndefined();
  });

  it('exposes the required fields first', () => {
    const required = TIS_MAP_FIELDS.filter((f) => f.required).map((f) => f.key);
    expect(required).toEqual(['name', 'lat', 'lng']);
  });
});
