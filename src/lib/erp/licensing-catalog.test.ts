import { describe, it, expect } from 'vitest';
import {
  CORE_MODULES, INDUSTRY_PACKS, PACK_CORE_PRESELECT, PACK_ROLE_SUGGESTIONS,
  classifyModuleKey, packForBusinessType, suggestedRolesForBusinessType,
  coreModuleDbKey, moduleEnabled,
} from './licensing-catalog';

describe('licensing catalog — groups', () => {
  it('has the 10 Core Modules', () => {
    expect(CORE_MODULES.map((m) => m.key)).toEqual([
      'crm', 'sales', 'inventory', 'purchasing', 'finance', 'pos', 'workflow', 'analytics', 'field_ops', 'integrations',
    ]);
  });
  it('has the 9 Industry Packs incl. Electrical Retail & Wholesale (first-class)', () => {
    expect(INDUSTRY_PACKS.map((p) => p.key)).toEqual([
      'clinic', 'pharmacy', 'distribution', 'retail', 'electrical', 'restaurant', 'hotel', 'salon', 'laundry',
    ]);
    expect(INDUSTRY_PACKS.find((p) => p.key === 'electrical')?.labelEn).toBe('Electrical Retail & Wholesale');
  });
  it('every item has ar + en labels', () => {
    for (const it of [...CORE_MODULES, ...INDUSTRY_PACKS]) {
      expect(it.labelEn.length).toBeGreaterThan(0);
      expect(it.labelAr.length).toBeGreaterThan(0);
    }
  });
});

describe('licensing catalog — preselect map (approved defaults)', () => {
  it('matches the approved pack → core preselects', () => {
    expect(PACK_CORE_PRESELECT.clinic).toEqual(['crm', 'sales', 'inventory', 'workflow', 'analytics']);
    expect(PACK_CORE_PRESELECT.pharmacy).toEqual(['sales', 'inventory', 'purchasing', 'finance', 'pos', 'analytics']);
    expect(PACK_CORE_PRESELECT.distribution).toEqual(['crm', 'sales', 'inventory', 'purchasing', 'analytics', 'field_ops', 'workflow']);
    expect(PACK_CORE_PRESELECT.retail).toEqual(['sales', 'inventory', 'purchasing', 'finance', 'pos']);
    expect(PACK_CORE_PRESELECT.electrical).toEqual(['sales', 'inventory', 'purchasing', 'finance', 'pos', 'analytics']);
    expect(PACK_CORE_PRESELECT.restaurant).toEqual(['sales', 'inventory', 'purchasing', 'pos']);
    expect(PACK_CORE_PRESELECT.hotel).toEqual(['sales', 'inventory', 'purchasing', 'finance', 'workflow']);
    expect(PACK_CORE_PRESELECT.salon).toEqual(['sales', 'pos', 'crm']);
    expect(PACK_CORE_PRESELECT.laundry).toEqual(['sales', 'pos', 'workflow']);
  });
  it('only references valid core module keys', () => {
    const coreKeys = new Set(CORE_MODULES.map((m) => m.key));
    for (const list of Object.values(PACK_CORE_PRESELECT)) for (const k of list) expect(coreKeys.has(k)).toBe(true);
  });
});

describe('licensing catalog — role suggestions (approved defaults)', () => {
  it('matches the approved pack → roles', () => {
    expect(PACK_ROLE_SUGGESTIONS.clinic).toEqual(['System Admin', 'Clinic Manager', 'Receptionist', 'Doctor', 'Accountant']);
    expect(PACK_ROLE_SUGGESTIONS.pharmacy).toEqual(['System Admin', 'Pharmacist', 'Cashier', 'Storekeeper', 'Accountant']);
    expect(PACK_ROLE_SUGGESTIONS.distribution).toEqual(['System Admin', 'Sales Manager', 'Sales Supervisor', 'Salesman', 'Warehouse Keeper', 'Driver', 'Accountant']);
    expect(PACK_ROLE_SUGGESTIONS.electrical).toEqual(['System Admin', 'Branch Manager', 'Cashier', 'Salesman', 'Warehouse Keeper', 'Accountant']);
    expect(PACK_ROLE_SUGGESTIONS.retail).toEqual(['System Admin', 'Branch Manager', 'Cashier', 'Storekeeper']);
  });
});

describe('licensing catalog — classification + mapping', () => {
  it('classifies module keys into core vs pack (incl. R4B capability keys)', () => {
    for (const k of ['sales', 'inventory', 'purchasing', 'accounting', 'pos', 'warehousing', 'crm', 'workflow', 'analytics', 'field_ops', 'integrations']) expect(classifyModuleKey(k)).toBe('core');
    for (const k of ['clinic', 'pharmacy', 'restaurant', 'salon', 'laundry', 'hotel', 'market', 'wholesale', 'distribution']) expect(classifyModuleKey(k)).toBe('pack');
  });
  it('maps the catalog finance key to the DB accounting key', () => {
    expect(coreModuleDbKey('finance')).toBe('accounting');
    expect(coreModuleDbKey('sales')).toBe('sales');
    expect(coreModuleDbKey('crm')).toBe('crm');
  });
  it('moduleEnabled: empty list = unrestricted; otherwise membership', () => {
    expect(moduleEnabled([], 'crm')).toBe(true);
    expect(moduleEnabled(['crm', 'sales'], 'crm')).toBe(true);
    expect(moduleEnabled(['sales'], 'crm')).toBe(false);
  });
  it('maps business types to packs (English + Arabic-agnostic substrings)', () => {
    expect(packForBusinessType('Electrical Retail')).toBe('electrical');
    expect(packForBusinessType('clinic')).toBe('clinic');
    expect(packForBusinessType('Supermarket')).toBe('retail');
    expect(packForBusinessType('unknown trade')).toBeUndefined();
  });
  it('suggests roles via the pack', () => {
    expect(suggestedRolesForBusinessType('Pharmacy')).toEqual(PACK_ROLE_SUGGESTIONS.pharmacy);
    expect(suggestedRolesForBusinessType('hotel')).toBeNull(); // no role set provided for hotel
  });
});
