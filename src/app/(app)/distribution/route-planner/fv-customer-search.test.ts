import { describe, it, expect } from 'vitest';
import { matchesCustomerSearch, filterAssignedCustomers, type SearchableCustomer } from './fv-customer-search';

const rows: SearchableCustomer[] = [
  { code: 'AZIZ001', name: 'Aziz Test Customer 01', city: 'Jeddah', channel: 'Grocery' },
  { code: 'AZIZ002', name: 'Aziz Test Customer 02', city: 'Jeddah', channel: 'Mini Market' },
  { code: 'MK0007', name: 'Al Salam Market', city: 'Makkah', channel: 'Supermarket' },
  { code: null, name: 'Unknown Shop', city: null, channel: null },
];

describe('FV assigned-customer search (code / name / city / channel)', () => {
  it('empty query returns everything (no filtering)', () => {
    expect(filterAssignedCustomers(rows, '')).toHaveLength(4);
    expect(filterAssignedCustomers(rows, '   ')).toHaveLength(4);
  });

  it('matches by code (case-insensitive, substring)', () => {
    expect(filterAssignedCustomers(rows, 'aziz001').map((r) => r.code)).toEqual(['AZIZ001']);
    expect(filterAssignedCustomers(rows, 'AZIZ').map((r) => r.code)).toEqual(['AZIZ001', 'AZIZ002']);
  });

  it('matches by name', () => {
    expect(filterAssignedCustomers(rows, 'al salam').map((r) => r.code)).toEqual(['MK0007']);
  });

  it('matches by city', () => {
    expect(filterAssignedCustomers(rows, 'makkah').map((r) => r.code)).toEqual(['MK0007']);
    expect(filterAssignedCustomers(rows, 'jeddah')).toHaveLength(2);
  });

  it('matches by channel', () => {
    expect(filterAssignedCustomers(rows, 'mini market').map((r) => r.code)).toEqual(['AZIZ002']);
    expect(filterAssignedCustomers(rows, 'grocery').map((r) => r.code)).toEqual(['AZIZ001']);
  });

  it('no match returns an empty list', () => {
    expect(filterAssignedCustomers(rows, 'riyadh')).toEqual([]);
  });

  it('null fields never throw and simply do not match', () => {
    expect(matchesCustomerSearch({ code: null, name: 'X', city: null, channel: null }, 'grocery')).toBe(false);
    expect(matchesCustomerSearch({ code: null, name: 'X', city: null, channel: null }, 'x')).toBe(true);
  });
});
