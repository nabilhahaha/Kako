import { describe, it, expect } from 'vitest';
import { buildFormSchema, validateCustomValues } from './form-schema';
import type { CustomFieldDef } from './custom-fields';
import type { EntityField } from './entities';

const core: EntityField[] = [
  { key: 'code', labelAr: 'الكود', labelEn: 'Code', required: true },
  { key: 'name', labelAr: 'الاسم', labelEn: 'Name', required: true },
];
const cf = (o: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: 'x', entity: 'customer', key: 'k', label_ar: 'حقل', label_en: 'Field',
  type: 'text', required: false, options: [], validation: {}, visibility: null,
  sort: 0, is_active: true, ...o,
});

describe('buildFormSchema', () => {
  it('merges core then custom, marks source, sorts custom', () => {
    const s = buildFormSchema(core, [
      cf({ key: 'tier', sort: 2 }), cf({ key: 'region', sort: 1 }),
    ]);
    expect(s.map((f) => f.key)).toEqual(['code', 'name', 'region', 'tier']);
    expect(s[0].source).toBe('core');
    expect(s[2].source).toBe('custom');
  });
  it('excludes inactive custom fields', () => {
    const s = buildFormSchema([], [cf({ key: 'a', is_active: false }), cf({ key: 'b' })]);
    expect(s.map((f) => f.key)).toEqual(['b']);
  });
});

describe('validateCustomValues', () => {
  it('collects per-field errors, passes when valid', () => {
    const defs = [
      cf({ key: 'tier', type: 'select', required: true, options: [{ value: 'gold' }, { value: 'silver' }] }),
      cf({ key: 'score', type: 'number', validation: { min: 0, max: 100 } }),
    ];
    const bad = validateCustomValues(defs, { tier: 'bronze', score: '200' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.tier).toBeTruthy();
    expect(bad.errors.score).toBeTruthy();
    const good = validateCustomValues(defs, { tier: 'gold', score: '50' });
    expect(good.ok).toBe(true);
  });
  it('skips hidden fields (visibility) in validation', () => {
    const defs = [
      cf({ key: 'has_tax', type: 'boolean' }),
      cf({ key: 'tax_id', type: 'text', required: true, visibility: { when: 'has_tax', op: 'eq', value: 'true' } }),
    ];
    // tax_id required, but hidden because has_tax != 'true' → no error
    expect(validateCustomValues(defs, { has_tax: false }).ok).toBe(true);
    // visible now → required error
    expect(validateCustomValues(defs, { has_tax: 'true' }).ok).toBe(false);
  });
});
