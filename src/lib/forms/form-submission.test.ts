import { describe, it, expect } from 'vitest';
import { validateSubmission, buildResponsePhotoIds, sanitizeAnswers } from './form-submission';
import { resolveFormSchema, type FormSchema } from './form-schema';

function schema(fields: unknown[], settings?: Partial<FormSchema['settings']>): FormSchema {
  return resolveFormSchema({ fields, settings: { customerLink: 'none', requireGps: false, ...settings } });
}

describe('validateSubmission', () => {
  it('flags a required text field that is empty', () => {
    const s = schema([{ id: 'a', type: 'text', labelEn: 'A', required: true }]);
    expect(validateSubmission(s, { answers: {} })).toContainEqual({ scope: 'a', code: 'required' });
    expect(validateSubmission(s, { answers: { a: 'x' } })).toEqual([]);
  });

  it('ignores hidden required fields', () => {
    const s = schema([{ id: 'a', type: 'text', labelEn: 'A', required: true, visible: false }]);
    expect(validateSubmission(s, { answers: {} })).toEqual([]);
  });

  it('requires a photo when required or photoRequired', () => {
    const s = schema([{ id: 'p', type: 'photo', labelEn: 'P', photoRequired: true }]);
    expect(validateSubmission(s, { answers: {}, photoIdsByField: {} })).toContainEqual({ scope: 'p', code: 'photo_required' });
    expect(validateSubmission(s, { answers: {}, photoIdsByField: { p: ['att1'] } })).toEqual([]);
  });

  it('enforces customerLink=required', () => {
    const s = schema([{ id: 'a', type: 'text', labelEn: 'A' }], { customerLink: 'required' });
    expect(validateSubmission(s, { answers: {} })).toContainEqual({ scope: 'customer', code: 'customer_required' });
    expect(validateSubmission(s, { answers: {}, customerId: 'c1' })).toEqual([]);
  });

  it('does not require a customer when customerLink=optional/none', () => {
    const s = schema([{ id: 'a', type: 'text', labelEn: 'A' }], { customerLink: 'optional' });
    expect(validateSubmission(s, { answers: {} })).toEqual([]);
  });

  it('enforces requireGps', () => {
    const s = schema([{ id: 'a', type: 'text', labelEn: 'A' }], { requireGps: true });
    expect(validateSubmission(s, { answers: {}, hasGps: false })).toContainEqual({ scope: 'gps', code: 'gps_required' });
    expect(validateSubmission(s, { answers: {}, hasGps: true })).toEqual([]);
  });

  it('empty array / whitespace count as empty', () => {
    const s = schema([{ id: 'm', type: 'multiselect', labelEn: 'M', required: true, options: [{ value: 'x', labelEn: 'X', labelAr: 'x' }] }]);
    expect(validateSubmission(s, { answers: { m: [] } })).toContainEqual({ scope: 'm', code: 'required' });
    expect(validateSubmission(s, { answers: { m: ['x'] } })).toEqual([]);
  });
});

describe('buildResponsePhotoIds', () => {
  it('flattens photo fields in schema order, dropping empties', () => {
    const s = schema([
      { id: 'p1', type: 'photo', labelEn: 'P1' },
      { id: 't', type: 'text', labelEn: 'T' },
      { id: 'p2', type: 'photos', labelEn: 'P2' },
    ]);
    expect(buildResponsePhotoIds(s, { p2: ['b', ''], p1: ['a'] })).toEqual(['a', 'b']);
  });
  it('empty when nothing provided', () => {
    expect(buildResponsePhotoIds(schema([]), undefined)).toEqual([]);
  });
});

describe('sanitizeAnswers', () => {
  it('keeps only known non-photo fields with values', () => {
    const s = schema([
      { id: 'a', type: 'text', labelEn: 'A' },
      { id: 'p', type: 'photo', labelEn: 'P' },
    ]);
    expect(sanitizeAnswers(s, { a: 'x', p: ['att'], stray: 'y', empty: '' })).toEqual({ a: 'x' });
  });
});
