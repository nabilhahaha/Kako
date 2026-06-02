import { describe, it, expect } from 'vitest';
import {
  mostPermissive,
  resolveAccess,
  evaluateCondition,
  applyWriteAccess,
  configLockoutViolation,
  accessLockoutViolation,
  type AccessRow,
} from './field-governance';

const base = {
  defaultAccess: 'edit' as const,
  isProtected: false,
  isActive: true,
  applicable: true,
  accessRows: [] as AccessRow[],
  userRoles: ['salesman'],
  userPermissions: ['sales.sell'],
  isAdmin: false,
};

describe('field-governance · mostPermissive', () => {
  it('picks the highest level; empty = hidden', () => {
    expect(mostPermissive([])).toBe('hidden');
    expect(mostPermissive(['view', 'edit', 'view'])).toBe('edit');
    expect(mostPermissive(['hidden', 'required'])).toBe('required');
  });
});

describe('field-governance · resolveAccess', () => {
  it('safe default: no rows → registry default (edit)', () => {
    expect(resolveAccess(base)).toBe('edit');
  });

  it('not applicable or inactive → hidden', () => {
    expect(resolveAccess({ ...base, applicable: false })).toBe('hidden');
    expect(resolveAccess({ ...base, isActive: false })).toBe('hidden');
  });

  it('most-permissive across role AND permission subjects', () => {
    const rows: AccessRow[] = [
      { subjectType: 'role', subjectKey: 'salesman', access: 'hidden' },
      { subjectType: 'permission', subjectKey: 'sales.sell', access: 'edit' },
    ];
    expect(resolveAccess({ ...base, accessRows: rows })).toBe('edit');
  });

  it('role with no matching subject falls back to default', () => {
    const rows: AccessRow[] = [{ subjectType: 'role', subjectKey: 'finance', access: 'edit' }];
    expect(resolveAccess({ ...base, defaultAccess: 'view', accessRows: rows })).toBe('view');
  });

  it('admin is never hidden; protected admin stays ≥ edit', () => {
    const hide: AccessRow[] = [{ subjectType: 'role', subjectKey: 'admin', access: 'hidden' }];
    const adminCtx = { ...base, userRoles: ['admin'], isAdmin: true, accessRows: hide };
    expect(resolveAccess(adminCtx)).toBe('view'); // clamped up from hidden
    expect(resolveAccess({ ...adminCtx, isProtected: true })).toBe('edit'); // protected floor
  });

  it('non-admin CAN be hidden (the rep example)', () => {
    const rows: AccessRow[] = [{ subjectType: 'role', subjectKey: 'salesman', access: 'hidden' }];
    expect(resolveAccess({ ...base, accessRows: rows })).toBe('hidden');
  });
});

describe('field-governance · evaluateCondition', () => {
  it('no condition → applicable', () => {
    expect(evaluateCondition(null, {})).toBe(true);
  });
  it('eq / is_true / in', () => {
    expect(evaluateCondition({ when: 'payment_type', op: 'eq', value: 'credit' }, { payment_type: 'credit' })).toBe(true);
    expect(evaluateCondition({ when: 'is_vat_registered', op: 'is_true' }, { is_vat_registered: true })).toBe(true);
    expect(evaluateCondition({ when: 'segment_id', op: 'in', value: ['a', 'b'] }, { segment_id: 'b' })).toBe(true);
    expect(evaluateCondition({ when: 'segment_id', op: 'in', value: ['a', 'b'] }, { segment_id: 'z' })).toBe(false);
  });
});

describe('field-governance · lockout protection', () => {
  it('protected fields cannot be disabled or defaulted hidden', () => {
    expect(configLockoutViolation(true, { is_active: false })).toBe('protected_field_cannot_be_disabled');
    expect(configLockoutViolation(true, { default_access: 'hidden' })).toBe('protected_field_cannot_be_hidden');
    expect(configLockoutViolation(true, { default_access: 'view' })).toBeNull();
    expect(configLockoutViolation(false, { is_active: false })).toBeNull(); // non-protected ok
  });

  it('admin role subjects cannot be hidden; protected admin must keep edit', () => {
    expect(accessLockoutViolation(false, 'role', 'admin', 'hidden')).toBe('cannot_hide_from_admin');
    expect(accessLockoutViolation(true, 'role', 'it_admin', 'view')).toBe('protected_field_admin_must_edit');
    expect(accessLockoutViolation(false, 'role', 'salesman', 'hidden')).toBeNull(); // non-admin ok
    expect(accessLockoutViolation(false, 'role', 'admin', 'edit')).toBeNull();
  });
});

describe('field-governance · applyWriteAccess', () => {
  it('reverts view/hidden to current; flags missing required; passes editable', () => {
    const fields = [
      { key: 'credit_limit', access: 'view' as const },
      { key: 'name', access: 'required' as const },
      { key: 'phone', access: 'edit' as const },
      { key: 'tax_number', access: 'hidden' as const },
    ];
    const input = { credit_limit: 9999, name: '', phone: '0500', tax_number: 'HACK' };
    const current = { credit_limit: 100, name: 'Old', phone: '0400', tax_number: '300' };
    const { data, missingRequired } = applyWriteAccess(fields, input, current);
    expect(data.credit_limit).toBe(100); // view → reverted
    expect(data.tax_number).toBe('300'); // hidden → reverted
    expect(data.phone).toBe('0500');     // edit → accepted
    expect(missingRequired).toEqual(['name']);
  });

  it('zero-config (no governed fields) passes input through untouched', () => {
    const input = { a: 1, b: 2 };
    const { data, missingRequired } = applyWriteAccess([], input, {});
    expect(data).toEqual(input);
    expect(missingRequired).toEqual([]);
  });
});
