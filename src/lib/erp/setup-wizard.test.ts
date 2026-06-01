import { describe, it, expect } from 'vitest';
import { ELECTRICAL_ROLES, ALL_ROLES, getSetupProfile } from './setup-wizard';

describe('setup wizard — Electrical suggested roles (UX)', () => {
  it('ELECTRICAL_ROLES are the 14 industry-specific roles, bilingual', () => {
    expect(ELECTRICAL_ROLES.map((r) => r.en)).toEqual([
      'System Administrator', 'General Manager', 'Branch Manager', 'Sales Manager',
      'Sales Supervisor', 'Sales Representative', 'Projects Sales Representative',
      'Purchasing Manager', 'Warehouse Keeper', 'Warehouse Supervisor', 'Accountant',
      'Warranty Officer', 'RMA Officer', 'Driver / Delivery Representative',
    ]);
    for (const r of ELECTRICAL_ROLES) {
      expect(r.ar.length).toBeGreaterThan(0);
      expect(r.en.length).toBeGreaterThan(0);
    }
  });

  it('the electronics (Electrical pack) profile defaults to the electrical roles', () => {
    const profile = getSetupProfile('electronics');
    expect(profile?.roles.map((r) => r.en)).toEqual(ELECTRICAL_ROLES.map((r) => r.en));
    // no cross-industry roles surface in the default electrical set
    const en = profile!.roles.map((r) => r.en);
    for (const foreign of ['Doctor', 'Beautician', 'Receptionist', 'Housekeeping']) {
      expect(en).not.toContain(foreign);
    }
  });

  it('ALL_ROLES (Show all roles) still exposes the full catalog incl. cross-industry', () => {
    const en = ALL_ROLES.map((r) => r.en);
    for (const role of ['Doctor', 'Receptionist', 'Beautician', 'Housekeeping', 'Technician', 'Accountant']) {
      expect(en).toContain(role);
    }
    for (const r of ALL_ROLES) expect(r.ar.length).toBeGreaterThan(0);
  });
});
