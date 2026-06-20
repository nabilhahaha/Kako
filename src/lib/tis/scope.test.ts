import { describe, it, expect } from 'vitest';
import { buildTisCustomer } from './dataset';
import { emptyScope, withRegion, withSalesman, toggleRoute, scopeMatches, scopeCustomers, scopeOptions, initialScopeRegion } from './scope';

const cust = (id: string, region: string, salesman: string | null, route: string | null) =>
  buildTisCustomer({ id, name: id, ownership: { regionId: region, salesmanId: salesman, routeId: route, supervisorId: null, areaId: null } });

const SET = [
  cust('a', 'r1', 's1', 'rt1'),
  cust('b', 'r1', 's1', 'rt2'),
  cust('c', 'r1', 's2', 'rt3'),
  cust('d', 'r2', 's3', 'rt4'),
  cust('e', 'r2', null, null),
];

describe('scope filtering', () => {
  it('all customers when unscoped', () => {
    expect(scopeCustomers(SET, emptyScope())).toHaveLength(5);
  });
  it('narrows by region', () => {
    expect(scopeCustomers(SET, withRegion('r1')).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('narrows region → salesman', () => {
    const s = withSalesman(withRegion('r1'), 's1');
    expect(scopeCustomers(SET, s).map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('narrows region → salesman → route', () => {
    const s = toggleRoute(withSalesman(withRegion('r1'), 's1'), 'rt1');
    expect(scopeCustomers(SET, s).map((c) => c.id)).toEqual(['a']);
  });
  it('scopeMatches respects each level', () => {
    expect(scopeMatches(SET[0], withRegion('r2'))).toBe(false);
    expect(scopeMatches(SET[3], withRegion('r2'))).toBe(true);
  });
});

describe('scopeOptions (progressive)', () => {
  it('region picks narrow the salesman + route lists', () => {
    const o = scopeOptions(SET, withRegion('r1'));
    expect(o.regions.map((r) => r.key).sort()).toEqual(['r1', 'r2']);
    expect(o.salesmen.map((s) => s.key).sort()).toEqual(['s1', 's2']);
    expect(o.routes.map((r) => r.key).sort()).toEqual(['rt1', 'rt2', 'rt3']);
    expect(o.working).toHaveLength(3);
    expect(o.totalRoutes).toBe(4);
  });
});

describe('initialScopeRegion', () => {
  it('stays "all" below the route threshold', () => {
    expect(initialScopeRegion(SET)).toBe('');
  });
  it('auto-scopes to the largest multi-route region at scale', () => {
    // 14 routes: region big has 13 routes, region tiny has 1 → scope to big.
    const big = Array.from({ length: 13 }, (_, i) => cust(`b${i}`, 'big', 's', `rt${i}`));
    const tiny = [cust('t', 'tiny', 's', 'rtX')];
    expect(initialScopeRegion([...big, ...tiny])).toBe('big');
  });
  it('honours an explicit default region', () => {
    const big = Array.from({ length: 13 }, (_, i) => cust(`b${i}`, 'big', 's', `rt${i}`));
    const other = Array.from({ length: 2 }, (_, i) => cust(`o${i}`, 'other', 's', `ro${i}`));
    expect(initialScopeRegion([...big, ...other], 'other')).toBe('other');
  });
});
