import { describe, it, expect } from 'vitest';
import {
  autoMapHeaders, getSourcePreset, listSourcePresets, normalizeHeader,
  type AutoMapField,
} from './onboarding-sources';

const customerFields: AutoMapField[] = [
  { key: 'code', labelEn: 'Code', labelAr: 'الكود' },
  { key: 'name', labelEn: 'Name', labelAr: 'الاسم' },
  { key: 'phone', labelEn: 'Phone', labelAr: 'الهاتف' },
  { key: 'email', labelEn: 'Email', labelAr: 'البريد' },
];

describe('onboarding-sources · normalizeHeader', () => {
  it('strips case + non-alphanumerics', () => {
    expect(normalizeHeader('Item Code')).toBe('itemcode');
    expect(normalizeHeader('item_code')).toBe('itemcode');
    expect(normalizeHeader('  Email Id ')).toBe('emailid');
  });
});

describe('onboarding-sources · presets', () => {
  it('exposes generic + erpnext + odoo', () => {
    expect(listSourcePresets().map((p) => p.key)).toEqual(['generic', 'erpnext', 'odoo']);
    expect(getSourcePreset('erpnext')!.labelEn).toContain('ERPNext');
    expect(getSourcePreset(undefined)).toBeUndefined();
  });
});

describe('onboarding-sources · autoMapHeaders', () => {
  it('matches by field key / label when no preset', () => {
    const m = autoMapHeaders(['Name', 'Phone', 'Email', 'extra'], customerFields);
    expect(m).toEqual({ name: 'Name', phone: 'Phone', email: 'Email' });
  });

  it('uses ERPNext aliases for headers that differ from our field names', () => {
    const headers = ['Customer Name', 'Mobile No', 'Email Id'];
    const m = autoMapHeaders(headers, customerFields, getSourcePreset('erpnext'), 'customer');
    expect(m.name).toBe('Customer Name');
    expect(m.phone).toBe('Mobile No');
    expect(m.email).toBe('Email Id');
  });

  it('uses Odoo aliases (Internal Reference → code)', () => {
    const headers = ['Internal Reference', 'Name', 'Phone'];
    const m = autoMapHeaders(headers, customerFields, getSourcePreset('odoo'), 'customer');
    expect(m.code).toBe('Internal Reference');
    expect(m.name).toBe('Name');
  });

  it('preset aliases take priority over generic label match', () => {
    // "Name" exists but ERPNext maps code←Customer; ensure both resolve distinctly.
    const headers = ['Customer', 'Customer Name'];
    const m = autoMapHeaders(headers, customerFields, getSourcePreset('erpnext'), 'customer');
    expect(m.code).toBe('Customer');
    expect(m.name).toBe('Customer Name');
  });

  it('returns only confident matches (unmatched fields omitted)', () => {
    const m = autoMapHeaders(['Whatever'], customerFields);
    expect(m).toEqual({});
  });
});
