import { describe, it, expect } from 'vitest';
import {
  LIMIT_ACTIONS,
  isLimitAction,
  toRoleLimit,
  resolveLimit,
  withinLimit,
  type RoleLimit,
} from './limits';

const userRow = (over: Partial<RoleLimit> = {}): RoleLimit => ({
  id: 'u', companyId: 'co', userId: 'U1', roleKey: null,
  action: 'purchasing.po.approve', maxAmount: 10000, maxPercent: null, ...over,
});
const roleRow = (over: Partial<RoleLimit> = {}): RoleLimit => ({
  id: 'r', companyId: 'co', userId: null, roleKey: 'branch_manager',
  action: 'purchasing.po.approve', maxAmount: 5000, maxPercent: null, ...over,
});

describe('limits — action catalog', () => {
  it('includes the net-new deny-all approval/override actions', () => {
    for (const a of [
      'purchasing.po.approve', 'accounting.voucher.approve',
      'inventory.adjustment.approve', 'sales.price.override', 'sales.payment.writeoff',
    ]) {
      expect(LIMIT_ACTIONS).toContain(a);
      expect(isLimitAction(a)).toBe(true);
    }
    expect(isLimitAction('not.a.limit')).toBe(false);
  });
});

describe('limits — toRoleLimit mapper', () => {
  it('coerces numeric strings and empty/null to null', () => {
    const r = toRoleLimit({
      id: 'x', company_id: 'co', user_id: null, role_key: 'admin',
      action: 'sales.price.override', max_amount: '2500.50', max_percent: '',
    });
    expect(r).toEqual({
      id: 'x', companyId: 'co', userId: null, roleKey: 'admin',
      action: 'sales.price.override', maxAmount: 2500.5, maxPercent: null,
    });
  });
});

describe('limits — resolveLimit precedence (mirrors erp_within_limit)', () => {
  it('returns null when no applicable rows (CUTOVER-SAFE unconstrained)', () => {
    expect(resolveLimit([], 'U1', ['branch_manager'], 'purchasing.po.approve')).toBeNull();
    // rows exist but for a different action
    expect(resolveLimit([roleRow({ action: 'sales.return.approve' })], 'U1', ['branch_manager'], 'purchasing.po.approve')).toBeNull();
  });

  it('a USER-specific row overrides role defaults', () => {
    const rows = [userRow({ maxAmount: 10000 }), roleRow({ maxAmount: 5000 })];
    expect(resolveLimit(rows, 'U1', ['branch_manager'], 'purchasing.po.approve')).toEqual({
      maxAmount: 10000, maxPercent: null,
    });
  });

  it('multiple role rows resolve to the MOST PERMISSIVE (max) cap', () => {
    const rows = [
      roleRow({ roleKey: 'branch_manager', maxAmount: 5000 }),
      roleRow({ id: 'r2', roleKey: 'regional_manager', maxAmount: 20000 }),
    ];
    expect(resolveLimit(rows, 'U1', ['branch_manager', 'regional_manager'], 'purchasing.po.approve')).toEqual({
      maxAmount: 20000, maxPercent: null,
    });
  });

  it('a null cap among role rows means unlimited for that facet', () => {
    const rows = [
      roleRow({ roleKey: 'branch_manager', maxAmount: 5000 }),
      roleRow({ id: 'r2', roleKey: 'sales_director', maxAmount: null }),
    ];
    expect(resolveLimit(rows, 'U1', ['branch_manager', 'sales_director'], 'purchasing.po.approve')).toEqual({
      maxAmount: null, maxPercent: null,
    });
  });
});

describe('limits — withinLimit', () => {
  it('unconstrained when no rows', () => {
    expect(withinLimit([], 'U1', ['salesman'], 'sales.price.override', 99999)).toBe(true);
  });
  it('enforces the resolved amount cap', () => {
    const rows = [userRow({ maxAmount: 10000 })];
    expect(withinLimit(rows, 'U1', [], 'purchasing.po.approve', 10000)).toBe(true);
    expect(withinLimit(rows, 'U1', [], 'purchasing.po.approve', 10001)).toBe(false);
  });
  it('enforces a percent cap independently of amount', () => {
    const rows = [userRow({ action: 'sales.order.discount', maxAmount: null, maxPercent: 5 })];
    expect(withinLimit(rows, 'U1', [], 'sales.order.discount', 1_000_000, 5)).toBe(true);
    expect(withinLimit(rows, 'U1', [], 'sales.order.discount', 1, 5.01)).toBe(false);
  });
  it('null amount/percent argument skips that facet (e.g. amount-only check)', () => {
    const rows = [userRow({ maxAmount: 10000, maxPercent: 5 })];
    expect(withinLimit(rows, 'U1', [], 'purchasing.po.approve', null, null)).toBe(true);
  });
});
