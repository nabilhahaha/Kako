import { describe, it, expect } from 'vitest';
import {
  userCanAccessForm, customerScopeFilters, isUserScopeTarget, isCustomerScopeTarget,
  ROLE_ALL, type FormAssignment, type UserScope,
} from './form-assignments';

const scope: UserScope = {
  userId: 'u1',
  roles: ['salesman'],
  teamIds: ['t1'],
  departmentIds: ['d1'],
  branchIds: ['b1'],
  supervisorIds: ['sup1', 'sup2'],
};

const A = (targetType: FormAssignment['targetType'], targetValue: string, isActive = true): FormAssignment =>
  ({ targetType, targetValue, isActive });

describe('userCanAccessForm — user-scope matching', () => {
  it('direct user assignment', () => {
    expect(userCanAccessForm([A('user', 'u1')], scope)).toBe(true);
    expect(userCanAccessForm([A('user', 'other')], scope)).toBe(false);
  });
  it('role assignment + wildcard', () => {
    expect(userCanAccessForm([A('role', 'salesman')], scope)).toBe(true);
    expect(userCanAccessForm([A('role', 'admin')], scope)).toBe(false);
    expect(userCanAccessForm([A('role', ROLE_ALL)], scope)).toBe(true);
  });
  it('team / department / branch', () => {
    expect(userCanAccessForm([A('team', 't1')], scope)).toBe(true);
    expect(userCanAccessForm([A('department', 'd1')], scope)).toBe(true);
    expect(userCanAccessForm([A('branch', 'b1')], scope)).toBe(true);
    expect(userCanAccessForm([A('branch', 'bX')], scope)).toBe(false);
  });
  it('supervisor subtree (user reports up to sup1/sup2)', () => {
    expect(userCanAccessForm([A('supervisor', 'sup2')], scope)).toBe(true);
    expect(userCanAccessForm([A('supervisor', 'nope')], scope)).toBe(false);
  });
  it('inactive assignments never match', () => {
    expect(userCanAccessForm([A('user', 'u1', false)], scope)).toBe(false);
  });
  it('customer-scope targets do NOT grant visibility', () => {
    expect(userCanAccessForm([A('dataset', 'ds1'), A('city', 'Riyadh'), A('channel', 'Retail')], scope)).toBe(false);
  });
  it('no assignments → no access', () => {
    expect(userCanAccessForm([], scope)).toBe(false);
  });
  it('any one matching active assignment is enough', () => {
    expect(userCanAccessForm([A('role', 'admin'), A('team', 't1')], scope)).toBe(true);
  });
});

describe('customerScopeFilters', () => {
  it('collects active dataset/city/channel targets only', () => {
    const filters = customerScopeFilters([
      A('dataset', 'ds1'), A('dataset', 'ds2'), A('city', 'Riyadh'),
      A('channel', 'Retail'), A('channel', 'HoReCa', false), A('user', 'u1'),
    ]);
    expect(filters).toEqual({ datasetIds: ['ds1', 'ds2'], cities: ['Riyadh'], channels: ['Retail'] });
  });
  it('empty when only user-scope targets', () => {
    expect(customerScopeFilters([A('role', 'salesman')])).toEqual({ datasetIds: [], cities: [], channels: [] });
  });
});

describe('scope predicates', () => {
  it('classifies target types', () => {
    expect(isUserScopeTarget('role')).toBe(true);
    expect(isUserScopeTarget('dataset')).toBe(false);
    expect(isCustomerScopeTarget('city')).toBe(true);
    expect(isCustomerScopeTarget('user')).toBe(false);
  });
});
