import { describe, it, expect } from 'vitest';
import {
  CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS,
  coerceCustomValue, validateCustomValue, isFieldVisible, slugifyFieldKey,
  type CustomFieldDef,
} from './custom-fields';

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: 'f1', entity: 'customer', key: 'k', label_ar: 'حقل', label_en: 'Field',
  type: 'text', required: false, options: [], validation: {}, visibility: null,
  sort: 0, is_active: true, ...over,
});

describe('custom-fields catalog', () => {
  it('every type has ar/en labels', () => {
    for (const t of CUSTOM_FIELD_TYPES) {
      expect(CUSTOM_FIELD_TYPE_LABELS[t].en).toBeTruthy();
      expect(CUSTOM_FIELD_TYPE_LABELS[t].ar).toBeTruthy();
    }
  });
});

describe('coerceCustomValue', () => {
  it('coerces by type, empty → undefined', () => {
    expect(coerceCustomValue({ type: 'number' }, '12')).toBe(12);
    expect(coerceCustomValue({ type: 'boolean' }, 'yes')).toBe(true);
    expect(coerceCustomValue({ type: 'boolean' }, '0')).toBe(false);
    expect(coerceCustomValue({ type: 'multiselect' }, 'a, b|c')).toEqual(['a', 'b', 'c']);
    expect(coerceCustomValue({ type: 'text' }, '  hi ')).toBe('hi');
    expect(coerceCustomValue({ type: 'text' }, '')).toBeUndefined();
  });
});

describe('validateCustomValue', () => {
  it('required', () => {
    expect(validateCustomValue(def({ required: true }), '')).toMatch(/required/);
    expect(validateCustomValue(def({ required: false }), '')).toBeNull();
  });
  it('number min/max', () => {
    expect(validateCustomValue(def({ type: 'number', validation: { min: 0, max: 10 } }), '5')).toBeNull();
    expect(validateCustomValue(def({ type: 'number', validation: { max: 10 } }), '11')).toMatch(/≤ 10/);
    expect(validateCustomValue(def({ type: 'number' }), 'abc')).toMatch(/invalid number/);
  });
  it('select / multiselect option membership', () => {
    const opts = [{ value: 'a' }, { value: 'b' }];
    expect(validateCustomValue(def({ type: 'select', options: opts }), 'a')).toBeNull();
    expect(validateCustomValue(def({ type: 'select', options: opts }), 'z')).toMatch(/allowed option/);
    expect(validateCustomValue(def({ type: 'multiselect', options: opts }), 'a,b')).toBeNull();
    expect(validateCustomValue(def({ type: 'multiselect', options: opts }), 'a,z')).toMatch(/"z"/);
  });
  it('date + text regex/email', () => {
    expect(validateCustomValue(def({ type: 'date' }), 'not-a-date')).toMatch(/invalid date/);
    expect(validateCustomValue(def({ type: 'date' }), '2026-01-01')).toBeNull();
    expect(validateCustomValue(def({ key: 'email', type: 'text' }), 'bad')).toMatch(/invalid email/);
    expect(validateCustomValue(def({ type: 'text', validation: { regex: '^[0-9]+$' } }), 'abc')).toMatch(/invalid format/);
  });
});

describe('isFieldVisible', () => {
  it('no rule → visible; eq/neq/in', () => {
    expect(isFieldVisible(def({}), {})).toBe(true);
    expect(isFieldVisible(def({ visibility: { when: 'a', op: 'eq', value: 'x' } }), { a: 'x' })).toBe(true);
    expect(isFieldVisible(def({ visibility: { when: 'a', op: 'eq', value: 'x' } }), { a: 'y' })).toBe(false);
    expect(isFieldVisible(def({ visibility: { when: 'a', op: 'in', value: ['x', 'y'] } }), { a: 'y' })).toBe(true);
  });
});

describe('slugifyFieldKey', () => {
  it('produces a safe key', () => {
    expect(slugifyFieldKey('Loyalty Tier!')).toBe('loyalty_tier');
    expect(slugifyFieldKey('  VAT/TRN  ')).toBe('vat_trn');
  });
});
