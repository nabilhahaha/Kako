import { describe, it, expect } from 'vitest';
import {
  mostPermissive,
  resolveAccess,
  evaluateCondition,
  applyWriteAccess,
  configLockoutViolation,
  accessLockoutViolation,
  resolveLayout,
  isSectionAccessible,
  type AccessRow,
  type GovInputs,
  type SectionAccessRow,
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

describe('field-governance · capability subjects (P5)', () => {
  it('matches a capability-subject access row against the user capabilities', () => {
    const rows: AccessRow[] = [{ subjectType: 'capability', subjectKey: 'customers.financials.view', access: 'view' }];
    // no caps → falls back to default
    expect(resolveAccess({ ...base, defaultAccess: 'hidden', accessRows: rows })).toBe('hidden');
    // holds the capability → row applies (view)
    expect(resolveAccess({ ...base, defaultAccess: 'hidden', accessRows: rows, userCapabilities: ['customers.financials.view'] })).toBe('view');
  });
  it('most-permissive across role, permission AND capability subjects', () => {
    const rows: AccessRow[] = [
      { subjectType: 'role', subjectKey: 'salesman', access: 'hidden' },
      { subjectType: 'capability', subjectKey: 'sales.price.override', access: 'edit' },
    ];
    expect(resolveAccess({ ...base, accessRows: rows, userCapabilities: ['sales.price.override'] })).toBe('edit');
  });
});

describe('field-governance · isSectionAccessible (P5)', () => {
  const view = (st: SectionAccessRow['subjectType'], key: string): SectionAccessRow => ({ subjectType: st, subjectKey: key, access: 'view' });
  const hide = (st: SectionAccessRow['subjectType'], key: string): SectionAccessRow => ({ subjectType: st, subjectKey: key, access: 'hidden' });

  it('CUTOVER-SAFE: no rows → visible; admin always visible', () => {
    expect(isSectionAccessible(undefined, ['salesman'], [], [], false)).toBe(true);
    expect(isSectionAccessible([], ['salesman'], [], [], false)).toBe(true);
    expect(isSectionAccessible([hide('role', 'salesman')], ['salesman'], [], [], true)).toBe(true); // admin bypass
  });
  it('restricted section: visible only to a subject granted view', () => {
    const rows = [view('role', 'accountant'), view('capability', 'customers.financials.view')];
    expect(isSectionAccessible(rows, ['accountant'], [], [], false)).toBe(true);   // role match
    expect(isSectionAccessible(rows, ['salesman'], [], ['customers.financials.view'], false)).toBe(true); // capability match
    expect(isSectionAccessible(rows, ['salesman'], [], [], false)).toBe(false);    // no match → hidden
  });
  it('most-permissive among matches; an explicit hidden does not grant', () => {
    const rows = [hide('role', 'salesman'), view('permission', 'reports.view')];
    expect(isSectionAccessible(rows, ['salesman'], [], [], false)).toBe(false);              // only a hidden match
    expect(isSectionAccessible(rows, ['salesman'], ['reports.view'], [], false)).toBe(true); // a view match wins
  });
});

describe('field-governance · resolveLayout section gating (P5)', () => {
  const gov: GovInputs = {
    fields: [
      { key: 'credit_limit', source: 'core', isProtected: false, defaultAccess: 'edit', isActive: true, section: 'financial', condition: null, accessRows: [] },
      { key: 'phone', source: 'core', isProtected: false, defaultAccess: 'edit', isActive: true, section: 'contacts', condition: null, accessRows: [] },
    ],
    userRoles: ['salesman'], userPermissions: [], userCapabilities: [],
    sectionAccess: { financial: [{ subjectType: 'role', subjectKey: 'accountant', access: 'view' }] },
    isAdmin: false,
  };
  it('hides fields whose section the user cannot access; leaves ungoverned sections', () => {
    const m = resolveLayout(gov, {});
    expect(m.get('credit_limit')).toBe('hidden'); // financial restricted to accountant
    expect(m.get('phone')).toBe('edit');          // contacts ungoverned → visible
  });
  it('without sectionAccess, sections do not gate (cutover-safe)', () => {
    const m = resolveLayout({ ...gov, sectionAccess: undefined }, {});
    expect(m.get('credit_limit')).toBe('edit');
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

describe('field-governance · resolveLayout', () => {
  const gov: GovInputs = {
    fields: [
      { key: 'credit_limit', source: 'core', isProtected: false, defaultAccess: 'edit', isActive: true, section: 'commercial',
        condition: { when: 'payment_type', op: 'eq', value: 'credit' },
        accessRows: [{ subjectType: 'role', subjectKey: 'salesman', access: 'hidden' }] },
      { key: 'name', source: 'core', isProtected: true, defaultAccess: 'edit', isActive: true, section: null, condition: null, accessRows: [] },
    ],
    userRoles: ['salesman'], userPermissions: [], isAdmin: false,
  };
  it('applies conditions + access per record context', () => {
    // cash customer → credit_limit not applicable → hidden
    expect(resolveLayout(gov, { payment_type: 'cash' }).get('credit_limit')).toBe('hidden');
    // credit customer → applicable, but salesman role hides it
    expect(resolveLayout(gov, { payment_type: 'credit' }).get('credit_limit')).toBe('hidden');
    // name always editable
    expect(resolveLayout(gov, {}).get('name')).toBe('edit');
  });
  it('empty inputs → empty map (ungoverned = today)', () => {
    expect(resolveLayout({ fields: [], userRoles: [], userPermissions: [], isAdmin: false }, {}).size).toBe(0);
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

  it('request (G6) is read-only for a direct write — reverts to current', () => {
    const fields = [{ key: 'cr_number', access: 'request' as const }];
    const { data } = applyWriteAccess(fields, { cr_number: 'CHANGED' }, { cr_number: 'CR-100' });
    expect(data.cr_number).toBe('CR-100');
  });
});

describe('field-governance · request level (G6)', () => {
  it('ranks request between view and edit', () => {
    expect(mostPermissive(['view', 'request'])).toBe('request');
    expect(mostPermissive(['request', 'edit'])).toBe('edit');
  });
  it('a request-level admin row on a protected field is a lockout violation', () => {
    expect(accessLockoutViolation(true, 'role', 'admin', 'request')).toBe('protected_field_admin_must_edit');
    expect(accessLockoutViolation(false, 'role', 'admin', 'request')).toBeNull();
  });
});
