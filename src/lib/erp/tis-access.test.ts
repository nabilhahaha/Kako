import { describe, it, expect } from 'vitest';
import { permissionsForRole, hasPermission } from './permissions';
import type { BranchRole } from './types';

/**
 * AC-6 access control — Studio + Journey Builder are gated on `reports.view`
 * (management); New Optimization on `tis.run_optimization`. Field roles must NOT
 * reach Studio/Journey Builder; only granted users reach New Optimization.
 */
const ctxFor = (role: BranchRole) => ({ isSuperAdmin: false, isPlatformOwner: false, permissions: permissionsForRole(role) });
const MANAGEMENT: BranchRole[] = ['admin', 'manager', 'sales_director', 'national_sales_manager', 'regional_manager', 'area_manager', 'branch_manager', 'supervisor'];
const FIELD: BranchRole[] = ['salesman', 'driver'];

describe('AC-6 — Studio / Journey Builder gate (reports.view)', () => {
  it('management roles can see them', () => {
    for (const r of MANAGEMENT) expect(hasPermission(ctxFor(r), 'reports.view')).toBe(true);
  });
  it('field roles cannot', () => {
    for (const r of FIELD) expect(hasPermission(ctxFor(r), 'reports.view')).toBe(false);
  });
});

describe('AC-6 — New Optimization gate (tis.run_optimization, permission-based)', () => {
  it('granted management roles have it; field roles do not', () => {
    expect(hasPermission(ctxFor('supervisor'), 'tis.run_optimization')).toBe(true);
    expect(hasPermission(ctxFor('area_manager'), 'tis.run_optimization')).toBe(true);
    expect(hasPermission(ctxFor('salesman'), 'tis.run_optimization')).toBe(false);
    expect(hasPermission(ctxFor('driver'), 'tis.run_optimization')).toBe(false);
  });
});
