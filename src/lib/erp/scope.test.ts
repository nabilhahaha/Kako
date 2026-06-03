import { describe, it, expect } from 'vitest';
import {
  SCOPED_ROLES,
  isScopedRole,
  isCompanyWide,
  SCOPE_DIMENSIONS,
  isScopeDimension,
  isTransitiveDimension,
  toScopeRef,
} from './scope';
import type { BranchRole } from './types';

describe('hierarchy visibility scope (S4)', () => {
  it('scopes exactly the five FMCG sales roles', () => {
    expect([...SCOPED_ROLES].sort()).toEqual(
      ['area_manager', 'branch_manager', 'regional_manager', 'salesman', 'supervisor'].sort(),
    );
  });

  it('company-wide roles are not scoped (zero regression)', () => {
    const companyWide: BranchRole[] = [
      'admin', 'manager', 'sales_director', 'national_sales_manager',
      'accountant', 'it_admin', 'viewer', 'cashier', 'warehouse_keeper',
      'staff', 'driver',
    ];
    for (const r of companyWide) expect(isScopedRole(r)).toBe(false);
  });

  it('a user is scoped only if ALL their roles are scoped', () => {
    expect(isCompanyWide(['salesman'])).toBe(false);
    expect(isCompanyWide(['supervisor', 'salesman'])).toBe(false);
    // any non-scoped role → company-wide (e.g. a rep who is also a cashier)
    expect(isCompanyWide(['salesman', 'cashier'])).toBe(true);
    expect(isCompanyWide(['admin'])).toBe(true);
    // no roles → not "company-wide" here (DB company_id gate handles lockout)
    expect(isCompanyWide([])).toBe(false);
  });
});

describe('per-assignment dimensions (P3 — mirrors 0121 erp_role_scope CHECK)', () => {
  it('declares exactly the six dimensions in the migration CHECK constraint', () => {
    // If this fails, the TS mirror has drifted from the erp_role_scope CHECK in
    // migration 0121 — update both together (TS list + SQL CHECK).
    expect([...SCOPE_DIMENSIONS].sort()).toEqual(
      ['area', 'branch', 'company', 'own_customers', 'own_team', 'region'].sort(),
    );
  });

  it('own_team is the ONLY transitive (recursive subtree) dimension', () => {
    const transitive = SCOPE_DIMENSIONS.filter(isTransitiveDimension);
    expect(transitive).toEqual(['own_team']);
  });

  it('isScopeDimension accepts known and rejects unknown values', () => {
    expect(isScopeDimension('company')).toBe(true);
    expect(isScopeDimension('own_team')).toBe(true);
    expect(isScopeDimension('global')).toBe(false);
    expect(isScopeDimension('')).toBe(false);
  });
});

describe('toScopeRef row mapper (read helper; RLS stays source of truth)', () => {
  const base = {
    id: 's1',
    company_id: 'co1',
    user_id: 'u1',
    role_key: 'supervisor',
    dimension: 'own_team',
    scope_set: [] as unknown,
  };

  it('maps a valid snake_case row to a typed ScopeRef', () => {
    expect(toScopeRef(base)).toEqual({
      id: 's1',
      companyId: 'co1',
      userId: 'u1',
      roleKey: 'supervisor',
      dimension: 'own_team',
      scopeSet: [],
    });
  });

  it('keeps only string ids in scope_set, dropping non-strings', () => {
    const r = toScopeRef({ ...base, dimension: 'branch', scope_set: ['b1', 2, null, 'b2'] });
    expect(r?.scopeSet).toEqual(['b1', 'b2']);
  });

  it('returns null for an unknown dimension (defensive)', () => {
    expect(toScopeRef({ ...base, dimension: 'galaxy' })).toBeNull();
  });

  it('treats a non-array scope_set as empty', () => {
    expect(toScopeRef({ ...base, scope_set: null })?.scopeSet).toEqual([]);
    expect(toScopeRef({ ...base, scope_set: 'x' })?.scopeSet).toEqual([]);
  });
});
