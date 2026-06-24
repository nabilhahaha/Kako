import { describe, it, expect } from 'vitest';
import {
  resolveFormSchema, emptyFormSchema, buildFormSchema, validateFormSchema,
  visibleFields, reportFields, fieldLabel, isPhotoField, isChoiceField, answerText,
  DEFAULT_FORM_SETTINGS, type FormSchema, type FormField,
} from './form-schema';

function field(p: Partial<FormField> & { id: string }): FormField {
  return {
    id: p.id, type: p.type ?? 'text', labelEn: p.labelEn ?? 'L', labelAr: p.labelAr ?? 'ل',
    required: p.required ?? false, visible: p.visible ?? true, order: p.order ?? 0,
    help: p.help ?? null, options: p.options ?? [], photoRequired: p.photoRequired ?? false,
    includeInReport: p.includeInReport ?? true,
  };
}

describe('resolveFormSchema — defensive parsing', () => {
  it('empty/garbage input yields an empty schema with default settings', () => {
    expect(resolveFormSchema(null)).toEqual({ settings: DEFAULT_FORM_SETTINGS, fields: [] });
    expect(resolveFormSchema({}).fields).toEqual([]);
    expect(resolveFormSchema({ fields: 'nope' }).fields).toEqual([]);
  });

  it('drops fields with no id or an unknown type', () => {
    const r = resolveFormSchema({ fields: [
      { type: 'text' },                       // no id
      { id: 'a', type: 'nope' },              // bad type
      { id: 'b', type: 'text', labelEn: 'B' },
    ] });
    expect(r.fields.map((f) => f.id)).toEqual(['b']);
  });

  it('sorts by order and re-packs to 0..n-1', () => {
    const r = resolveFormSchema({ fields: [
      { id: 'a', type: 'text', order: 5 },
      { id: 'b', type: 'text', order: 2 },
      { id: 'c', type: 'text', order: 9 },
    ] });
    expect(r.fields.map((f) => f.id)).toEqual(['b', 'a', 'c']);
    expect(r.fields.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it('drops duplicate ids (first wins)', () => {
    const r = resolveFormSchema({ fields: [
      { id: 'x', type: 'text', labelEn: 'first' },
      { id: 'x', type: 'number', labelEn: 'second' },
    ] });
    expect(r.fields).toHaveLength(1);
    expect(r.fields[0].labelEn).toBe('first');
  });

  it('parses select options; ignores options on non-choice fields', () => {
    const r = resolveFormSchema({ fields: [
      { id: 's', type: 'select', options: [{ value: 'a', labelEn: 'A', labelAr: 'أ' }, { value: '' }] },
      { id: 't', type: 'text', options: [{ value: 'z' }] },
    ] });
    expect(r.fields[0].options).toEqual([{ value: 'a', labelEn: 'A', labelAr: 'أ' }]);
    expect(r.fields[1].options).toEqual([]);
  });

  it('photoRequired only kept for photo fields', () => {
    const r = resolveFormSchema({ fields: [
      { id: 'p', type: 'photo', photoRequired: true },
      { id: 't', type: 'text', photoRequired: true },
    ] });
    expect(r.fields[0].photoRequired).toBe(true);
    expect(r.fields[1].photoRequired).toBe(false);
  });

  it('parses + clamps settings', () => {
    expect(resolveFormSchema({ settings: { requireGps: true, radiusM: 80, customerLink: 'required' } }).settings)
      .toEqual({ requireGps: true, radiusM: 80, customerLink: 'required' });
    // bad customerLink falls back to default; non-number radius → null
    expect(resolveFormSchema({ settings: { customerLink: 'bogus', radiusM: 'x' } }).settings)
      .toEqual({ requireGps: false, radiusM: null, customerLink: 'optional' });
  });
});

describe('helpers', () => {
  it('emptyFormSchema is a valid empty draft', () => {
    expect(emptyFormSchema()).toEqual({ settings: DEFAULT_FORM_SETTINGS, fields: [] });
  });
  it('buildFormSchema normalizes (re-packs order)', () => {
    const s: FormSchema = { settings: DEFAULT_FORM_SETTINGS, fields: [field({ id: 'a', order: 7 })] };
    expect(buildFormSchema(s).fields[0].order).toBe(0);
  });
  it('visibleFields / reportFields filter correctly', () => {
    const s: FormSchema = { settings: DEFAULT_FORM_SETTINGS, fields: [
      field({ id: 'a', visible: true, includeInReport: true }),
      field({ id: 'b', visible: false, includeInReport: true }),
      field({ id: 'c', visible: true, includeInReport: false }),
    ] };
    expect(visibleFields(s).map((f) => f.id)).toEqual(['a', 'c']);
    expect(reportFields(s).map((f) => f.id)).toEqual(['a', 'b']);
  });
  it('fieldLabel falls back across locale then id', () => {
    expect(fieldLabel(field({ id: 'a', labelEn: 'Name', labelAr: 'الاسم' }), 'ar')).toBe('الاسم');
    expect(fieldLabel(field({ id: 'a', labelEn: 'Name', labelAr: '' }), 'ar')).toBe('Name');
    expect(fieldLabel(field({ id: 'a', labelEn: '', labelAr: '' }), 'en')).toBe('a');
  });
  it('type predicates', () => {
    expect(isPhotoField('photos')).toBe(true);
    expect(isPhotoField('text')).toBe(false);
    expect(isChoiceField('multiselect')).toBe(true);
    expect(isChoiceField('number')).toBe(false);
  });
  it('answerText renders by type', () => {
    const txt = field({ id: 't', type: 'text' });
    const bool = field({ id: 'b', type: 'boolean' });
    const sel = field({ id: 's', type: 'select', options: [{ value: 'r', labelEn: 'Retail', labelAr: 'تجزئة' }] });
    const multi = field({ id: 'm', type: 'multiselect', options: [{ value: 'a', labelEn: 'A', labelAr: 'أ' }, { value: 'b', labelEn: 'B', labelAr: 'ب' }] });
    expect(answerText(txt, 'hi', 'en')).toBe('hi');
    expect(answerText(bool, true, 'en', 'Yes', 'No')).toBe('Yes');
    expect(answerText(bool, false, 'en', 'Yes', 'No')).toBe('No');
    expect(answerText(sel, 'r', 'ar')).toBe('تجزئة');
    expect(answerText(multi, ['a', 'b'], 'en')).toBe('A, B');
    expect(answerText(txt, null, 'en')).toBe('');
  });
});

describe('validateFormSchema — publish gate', () => {
  it('flags an empty form', () => {
    expect(validateFormSchema(emptyFormSchema())).toEqual([{ scope: 'form', code: 'no_fields' }]);
  });
  it('flags a field with no label in either locale', () => {
    const s = resolveFormSchema({ fields: [{ id: 'a', type: 'text', labelEn: '', labelAr: '' }] });
    expect(validateFormSchema(s)).toContainEqual({ scope: 'a', code: 'missing_label' });
  });
  it('flags a choice field with no options', () => {
    const s = resolveFormSchema({ fields: [{ id: 'a', type: 'select', labelEn: 'X', options: [] }] });
    expect(validateFormSchema(s)).toContainEqual({ scope: 'a', code: 'choice_no_options' });
  });
  it('passes a well-formed form', () => {
    const s = resolveFormSchema({ fields: [
      { id: 'a', type: 'text', labelEn: 'Name' },
      { id: 'b', type: 'select', labelEn: 'Channel', options: [{ value: 'r', labelEn: 'Retail', labelAr: 'تجزئة' }] },
    ] });
    expect(validateFormSchema(s)).toEqual([]);
  });
});
