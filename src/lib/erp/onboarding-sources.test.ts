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

  it('maps ERPNext extra customer fields (Tax ID → cr_number, Payment Terms)', () => {
    const fields = [
      ...customerFields,
      { key: 'cr_number', labelEn: 'CR Number', labelAr: 'السجل التجاري' },
      { key: 'payment_terms_days', labelEn: 'Payment Terms (days)', labelAr: 'مدة السداد' },
    ];
    const m = autoMapHeaders(['Tax ID', 'Payment Terms'], fields, getSourcePreset('erpnext'), 'customer');
    expect(m.cr_number).toBe('Tax ID');
    expect(m.payment_terms_days).toBe('Payment Terms');
  });

  it('maps warehouse exports for ERPNext (Warehouse Name) and Odoo (Short Name → code)', () => {
    const whFields = [
      { key: 'name', labelEn: 'Name', labelAr: 'الاسم' },
      { key: 'code', labelEn: 'Code', labelAr: 'الكود' },
      { key: 'branch_ref', labelEn: 'Branch (code)', labelAr: 'مرجع الفرع' },
    ];
    const erp = autoMapHeaders(['Warehouse Name', 'Branch'], whFields, getSourcePreset('erpnext'), 'warehouse');
    expect(erp.name).toBe('Warehouse Name');
    expect(erp.branch_ref).toBe('Branch');

    const odoo = autoMapHeaders(['Name', 'Short Name', 'Company'], whFields, getSourcePreset('odoo'), 'warehouse');
    expect(odoo.name).toBe('Name');
    expect(odoo.code).toBe('Short Name');
    expect(odoo.branch_ref).toBe('Company');
  });

  it('returns only confident matches (unmatched fields omitted)', () => {
    const m = autoMapHeaders(['Whatever'], customerFields);
    expect(m).toEqual({});
  });
});
