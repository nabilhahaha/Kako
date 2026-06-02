import { describe, it, expect } from 'vitest';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  PLATFORM_PERMISSION_LABELS,
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_DEFAULTS,
  expandPlatformPermissions,
  isPlatformPermission,
  isPlatformRole,
} from './platform-permissions';
import { hasPlatformPermission } from './platform-context';

describe('platform permission catalog', () => {
  it('every permission and role has ar/en labels', () => {
    for (const p of PLATFORM_PERMISSIONS) {
      expect(PLATFORM_PERMISSION_LABELS[p].en).toBeTruthy();
      expect(PLATFORM_PERMISSION_LABELS[p].ar).toBeTruthy();
    }
    for (const r of PLATFORM_ROLES) {
      expect(PLATFORM_ROLE_LABELS[r].en).toBeTruthy();
      expect(PLATFORM_ROLE_LABELS[r].ar).toBeTruthy();
    }
  });

  it('does not expose an "owner" staff role (ownership is the profile flag)', () => {
    expect(isPlatformRole('owner')).toBe(false);
    expect(PLATFORM_ROLES).not.toContain('owner');
  });

  it('role defaults reference only valid permissions; admin has all', () => {
    for (const r of PLATFORM_ROLES) {
      for (const p of PLATFORM_ROLE_DEFAULTS[r]) expect(isPlatformPermission(p)).toBe(true);
    }
    expect(PLATFORM_ROLE_DEFAULTS.admin.sort()).toEqual([...PLATFORM_PERMISSIONS].sort());
    // least-privilege spot checks
    expect(PLATFORM_ROLE_DEFAULTS.sales).not.toContain('manage_billing');
    expect(PLATFORM_ROLE_DEFAULTS.support).not.toContain('export_data');
    expect(PLATFORM_ROLE_DEFAULTS.finance).toContain('manage_billing');
  });
});

describe('expandPlatformPermissions', () => {
  it('expands the owner sentinel to the full catalog', () => {
    expect(expandPlatformPermissions(['*']).sort()).toEqual([...PLATFORM_PERMISSIONS].sort());
  });
  it('keeps only valid keys and drops unknowns', () => {
    expect(expandPlatformPermissions(['view_companies', 'bogus'])).toEqual(['view_companies']);
    expect(expandPlatformPermissions([])).toEqual([]);
  });
});

describe('hasPlatformPermission', () => {
  it('owner has everything; staff only their set; null = none', () => {
    expect(hasPlatformPermission({ isOwner: true, permissions: [] }, 'manage_billing')).toBe(true);
    expect(hasPlatformPermission({ isOwner: false, permissions: ['view_companies'] }, 'view_companies')).toBe(true);
    expect(hasPlatformPermission({ isOwner: false, permissions: ['view_companies'] }, 'manage_users')).toBe(false);
    expect(hasPlatformPermission(null, 'view_companies')).toBe(false);
  });
});
