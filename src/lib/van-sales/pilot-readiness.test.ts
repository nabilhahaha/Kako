import { describe, it, expect } from 'vitest';
import { evaluatePilotReadiness, type ReadinessFacts } from './pilot-readiness';

const ready: ReadinessFacts = {
  vanSalesActive: true,
  salesmenCount: 2,
  vans: [{ assignedTo: 'u1', stockUnits: 100 }, { assignedTo: 'u2', stockUnits: 50 }],
  salesmenWithoutVan: [],
  productsTotal: 10,
  zeroPricedProducts: [],
  multiUomProducts: [],
  customersTotal: 20,
  customersApprovedOnBranch: 20,
  activeReturnReasons: 3,
  allowNegativeVanStock: false,
  discountCapPct: 10,
};

const find = (r: ReturnType<typeof evaluatePilotReadiness>, key: string) => r.checks.find((c) => c.key === key)!;

describe('pilot-readiness · evaluatePilotReadiness', () => {
  it('a fully-configured company is READY with zero blocking failures', () => {
    const r = evaluatePilotReadiness(ready);
    expect(r.ready).toBe(true);
    expect(r.blockingFailures).toBe(0);
    expect(r.checks.every((c) => c.status !== 'fail')).toBe(true);
  });

  it('Van Sales not enabled is a blocking failure', () => {
    const r = evaluatePilotReadiness({ ...ready, vanSalesActive: false });
    expect(find(r, 'van_sales_active').status).toBe('fail');
    expect(r.ready).toBe(false);
  });

  it('no assigned van is a blocking failure', () => {
    const r = evaluatePilotReadiness({ ...ready, vans: [{ assignedTo: null, stockUnits: 0 }] });
    expect(find(r, 'reps_have_vans').status).toBe('fail');
    expect(r.ready).toBe(false);
  });

  it('a salesman without a van warns but does not block', () => {
    const r = evaluatePilotReadiness({ ...ready, salesmenWithoutVan: ['Ali'] });
    expect(find(r, 'reps_have_vans').status).toBe('warn');
    expect(r.ready).toBe(true);
  });

  it('an empty van warns but does not block (load can happen day 1)', () => {
    const r = evaluatePilotReadiness({ ...ready, vans: [{ assignedTo: 'u1', stockUnits: 0 }] });
    expect(find(r, 'van_stock').status).toBe('warn');
    expect(find(r, 'van_stock').blocking).toBe(false);
    expect(r.ready).toBe(true);
  });

  it('the PRICE control blocks when any SKU is at price ≤ 0', () => {
    const r = evaluatePilotReadiness({ ...ready, zeroPricedProducts: ['SKU-1', 'SKU-2'] });
    const c = find(r, 'products_priced');
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('SKU-1');
    expect(r.ready).toBe(false);
  });

  it('multi-UoM SKUs warn (single-base-UoM pilot constraint) but do not block', () => {
    const r = evaluatePilotReadiness({ ...ready, multiUomProducts: ['SKU-9'] });
    expect(find(r, 'single_base_uom').status).toBe('warn');
    expect(r.ready).toBe(true);
  });

  it('no approved on-branch customers is a blocking failure', () => {
    const r = evaluatePilotReadiness({ ...ready, customersApprovedOnBranch: 0 });
    expect(find(r, 'customers_ready').status).toBe('fail');
    expect(r.ready).toBe(false);
  });

  it('some unapproved customers warn but do not block', () => {
    const r = evaluatePilotReadiness({ ...ready, customersTotal: 20, customersApprovedOnBranch: 15 });
    expect(find(r, 'customers_ready').status).toBe('warn');
    expect(r.ready).toBe(true);
  });

  it('no active return reason is a blocking failure', () => {
    const r = evaluatePilotReadiness({ ...ready, activeReturnReasons: 0 });
    expect(find(r, 'return_reasons').status).toBe('fail');
    expect(r.ready).toBe(false);
  });

  it('allow_negative_van_stock warns (policy sanity) but does not block', () => {
    const r = evaluatePilotReadiness({ ...ready, allowNegativeVanStock: true });
    expect(find(r, 'policy').status).toBe('warn');
    expect(r.ready).toBe(true);
  });

  it('counts multiple blocking failures', () => {
    const r = evaluatePilotReadiness({ ...ready, vanSalesActive: false, activeReturnReasons: 0, zeroPricedProducts: ['X'] });
    expect(r.blockingFailures).toBe(3);
    expect(r.ready).toBe(false);
  });
});
