import { describe, it, expect } from 'vitest';
import { sheetCsvUrl, rowsFromJson, redactConfig } from './route-planner-connectors';
import { toCustomers, isValidCustomer } from './route-planner-customer-map';

describe('sheetCsvUrl', () => {
  it('converts an edit URL to a CSV export URL with the gid', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC123_x/edit#gid=42'))
      .toBe('https://docs.google.com/spreadsheets/d/ABC123_x/export?format=csv&gid=42');
  });
  it('defaults gid to 0 when absent', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit'))
      .toBe('https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=0');
  });
  it('passes through an already-CSV/published link', () => {
    const u = 'https://docs.google.com/spreadsheets/d/e/2PACX/pub?output=csv';
    expect(sheetCsvUrl(u)).toBe(u);
  });
  it('returns null for a non-sheet URL', () => {
    expect(sheetCsvUrl('https://example.com/foo')).toBeNull();
    expect(sheetCsvUrl('')).toBeNull();
  });
});

describe('rowsFromJson', () => {
  it('reads a top-level array of objects', () => {
    expect(rowsFromJson([{ name: 'A', lat: 24.7 }, { name: 'B', lat: 25 }]))
      .toEqual([{ name: 'A', lat: '24.7' }, { name: 'B', lat: '25' }]);
  });
  it('reads from a wrapping key (data/rows/records) automatically', () => {
    expect(rowsFromJson({ data: [{ x: 1 }] })).toEqual([{ x: '1' }]);
    expect(rowsFromJson({ records: [{ x: 2 }] })).toEqual([{ x: '2' }]);
  });
  it('reads from an explicit dotted path', () => {
    expect(rowsFromJson({ result: { items: [{ y: 'z' }] } }, 'result.items')).toEqual([{ y: 'z' }]);
  });
  it('stringifies nested values and nulls', () => {
    expect(rowsFromJson([{ a: null, b: { c: 1 } }])).toEqual([{ a: '', b: '{"c":1}' }]);
  });
  it('returns [] when no array is found', () => {
    expect(rowsFromJson({ nope: true })).toEqual([]);
  });
});

describe('redactConfig (secret safety)', () => {
  it('removes the token and exposes only a hasToken flag', () => {
    expect(redactConfig({ endpoint: 'https://api.co', token: 'sk-secret' }))
      .toEqual({ endpoint: 'https://api.co', hasToken: true });
  });
  it('hasToken=false when no token set', () => {
    expect(redactConfig({ sheetUrl: 'u' })).toEqual({ sheetUrl: 'u', hasToken: false });
    expect(redactConfig(null)).toEqual({ hasToken: false });
  });
});

describe('shared map step (toCustomers) — identical for upload & connectors', () => {
  const rows = [{ Cust: 'Al Noor', Y: '24.7', X: '46.6', Code: 'C1' }, { Cust: '', Y: '', X: '', Code: 'C2' }];
  const mapping = { name: 'Cust', lat: 'Y', lng: 'X', code: 'Code' };
  it('maps rows onto HCustomer using the column mapping', () => {
    const cs = toCustomers(rows, mapping);
    expect(cs[0]).toEqual({ code: 'C1', name: 'Al Noor', lat: 24.7, lng: 46.6, salesman: null, route: null });
  });
  it('isValidCustomer requires a name and finite coordinates', () => {
    const cs = toCustomers(rows, mapping);
    expect(cs.filter(isValidCustomer)).toHaveLength(1);
  });
});
