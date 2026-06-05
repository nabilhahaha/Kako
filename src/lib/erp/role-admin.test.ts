import { describe, it, expect } from 'vitest';
import {
  validateRoleKey, slugifyRoleKey, isDangerousPermission, sanitizePermissions,
  permissionDiff, compareRoles, canDeleteRole, DANGEROUS_PERMISSIONS,
} from './role-admin';
import { ALL_PERMISSIONS } from './permissions';

describe('role key validation & slugify', () => {
  it('accepts clean slugs, rejects bad/duplicate', () => {
    expect(validateRoleKey('shift_lead', ['admin']).ok).toBe(true);
    expect(validateRoleKey('Shift Lead', []).errors).toContain('key_format');
    expect(validateRoleKey('1lead', []).errors).toContain('key_format');
    expect(validateRoleKey('admin', ['admin']).errors).toContain('key_taken');
  });
  it('slugifies free text', () => {
    expect(slugifyRoleKey('Shift Lead!')).toBe('shift_lead_');
    expect(slugifyRoleKey('  Área Manager ')).toBe('rea_manager');
  });
});

describe('dangerous permission classification', () => {
  it('flags elevated/financial/admin perms', () => {
    expect(isDangerousPermission('settings.users')).toBe(true);
    expect(isDangerousPermission('accounting.post')).toBe(true);
    expect(isDangerousPermission('stock_request.approve')).toBe(true);
    expect(isDangerousPermission('reports.view')).toBe(false);
    expect(isDangerousPermission('sales.sell')).toBe(false);
  });
  it('every dangerous permission is a real catalog permission', () => {
    const valid = new Set(ALL_PERMISSIONS as string[]);
    for (const p of DANGEROUS_PERMISSIONS) expect(valid.has(p), `stale dangerous perm: ${p}`).toBe(true);
  });
});

describe('sanitize / diff / compare', () => {
  it('drops stale & duplicate permissions', () => {
    const out = sanitizePermissions(['sales.sell', 'sales.sell', 'not.a.real.perm']);
    expect(out).toEqual(['sales.sell']);
  });
  it('permissionDiff reports added & removed', () => {
    expect(permissionDiff(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });
  it('compareRoles splits onlyA / onlyB / shared', () => {
    expect(compareRoles(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
      onlyA: ['a'], onlyB: ['d'], shared: ['b', 'c'],
    });
  });
  it('protects system roles from deletion', () => {
    expect(canDeleteRole(true)).toBe(false);
    expect(canDeleteRole(false)).toBe(true);
  });
});
