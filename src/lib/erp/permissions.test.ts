import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission, permissionsForRole, ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUP_LABELS } from './permissions';

describe('permission labels + groups', () => {
  it('every permission has en/ar labels and a known group label', () => {
    for (const p of ALL_PERMISSIONS) {
      const lbl = PERMISSION_LABELS[p];
      expect(lbl.en.length).toBeGreaterThan(0);
      expect(lbl.ar.length).toBeGreaterThan(0);
      expect(PERMISSION_GROUP_LABELS[lbl.group]).toBeDefined();
    }
  });
  it('includes the Electrical pack permission + group', () => {
    expect(PERMISSION_LABELS['electrical.rma'].group).toBe('electrical');
    expect(PERMISSION_GROUP_LABELS.electrical.en).toBe('Electrical');
  });
});

describe('hasPermission', () => {
  it('super admin holds every permission', () => {
    expect(hasPermission({ isSuperAdmin: true, permissions: [] }, 'clinic.manage')).toBe(true);
  });
  it('ordinary user holds only granted permissions', () => {
    const ctx = { isSuperAdmin: false, permissions: ['sales.sell' as const] };
    expect(hasPermission(ctx, 'sales.sell')).toBe(true);
    expect(hasPermission(ctx, 'clinic.manage')).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('passes when the user has at least one of the listed perms', () => {
    const ctx = { isSuperAdmin: false, permissions: ['clinic.doctor' as const] };
    expect(hasAnyPermission(ctx, ['clinic.manage', 'clinic.doctor'])).toBe(true);
    expect(hasAnyPermission(ctx, ['clinic.manage', 'clinic.reception'])).toBe(false);
  });
});

describe('FMCG hierarchy roles (S2)', () => {
  it('Branch Manager is distinct from Company Admin (no settings/billing)', () => {
    const bm = permissionsForRole('branch_manager');
    expect(bm).not.toContain('settings.users');
    expect(bm).not.toContain('settings.branches');
    expect(bm).toContain('sales.sell');
    expect(bm).toContain('purchasing.manage');
    // admin still has everything
    expect(permissionsForRole('admin')).toEqual(ALL_PERMISSIONS);
  });
  it('Sales Director / NSM have full commercial visibility (no settings)', () => {
    for (const r of ['sales_director', 'national_sales_manager'] as const) {
      const p = permissionsForRole(r);
      expect(p).toContain('reports.view');
      expect(p).toContain('accounting.view');
      expect(p).not.toContain('settings.users');
    }
  });
  it('IT Admin = technical settings only (no selling/finance)', () => {
    const it = permissionsForRole('it_admin');
    expect(it).toContain('integrations.manage');
    expect(it).toContain('workflow.manage');
    expect(it).not.toContain('sales.sell');
    expect(it).not.toContain('accounting.post');
  });
  it('manager is UNCHANGED (Option B: still all permissions)', () => {
    expect(permissionsForRole('manager')).toEqual(ALL_PERMISSIONS);
  });
});

describe('permissionsForRole', () => {
  it('admin expands to all permissions', () => {
    expect(permissionsForRole('admin')).toEqual(ALL_PERMISSIONS);
  });
  it('a scoped role gets a subset', () => {
    const viewer = permissionsForRole('viewer');
    expect(viewer.length).toBeGreaterThan(0);
    expect(viewer.length).toBeLessThan(ALL_PERMISSIONS.length);
  });
});
