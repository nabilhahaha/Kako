import { describe, it, expect } from 'vitest';
import { SCOPED_ROLES, isScopedRole, isCompanyWide } from './scope';
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
