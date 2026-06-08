import { describe, it, expect } from 'vitest';
import {
  FORM_BUILDER_ENABLED,
  allFields, isFieldVisible, validateFormDefinition, validateFormResponse,
  type FormDefinition,
} from './index';

const def = (over: Partial<FormDefinition> = {}): FormDefinition => ({
  sections: [
    { key: 's1', title: 'Main', fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'reason', label: 'Reason', type: 'select', required: true, options: [{ value: 'price' }, { value: 'address' }] },
      { key: 'detail', label: 'Detail', type: 'text', showWhen: { field: 'reason', equals: 'address' } },
    ] },
  ],
  ...over,
});

describe('form-builder/flags', () => {
  it('defaults OFF', () => { expect(FORM_BUILDER_ENABLED()).toBe(false); });
});

describe('form-builder/model', () => {
  it('allFields flattens sections in order', () => {
    expect(allFields(def()).map((f) => f.key)).toEqual(['name', 'reason', 'detail']);
  });

  it('isFieldVisible honors showWhen', () => {
    const detail = allFields(def())[2];
    expect(isFieldVisible(detail, { reason: 'address' })).toBe(true);
    expect(isFieldVisible(detail, { reason: 'price' })).toBe(false);
    expect(isFieldVisible(detail, {})).toBe(false);
  });

  it('validateFormDefinition catches dup keys, missing options, bad showWhen', () => {
    expect(validateFormDefinition(def())).toEqual([]);
    const bad: FormDefinition = { sections: [{ key: 's', title: 'x', fields: [
      { key: 'a', label: 'A', type: 'select' },                                  // no options
      { key: 'a', label: 'A2', type: 'text' },                                   // dup key
      { key: 'b', label: 'B', type: 'text', showWhen: { field: 'nope', equals: 1 } }, // unknown ref
    ] }] };
    const p = validateFormDefinition(bad);
    expect(p.some((x) => x.includes('requires options'))).toBe(true);
    expect(p.some((x) => x.includes('duplicate field key'))).toBe(true);
    expect(p.some((x) => x.includes('unknown/self'))).toBe(true);
  });

  it('validateFormResponse enforces required + skips hidden fields', () => {
    // reason=price hides `detail`, so only name+reason required.
    expect(validateFormResponse(def(), { name: 'A', reason: 'price' })).toEqual([]);
    const missing = validateFormResponse(def(), { reason: 'address' });
    expect(missing.some((x) => x.includes('Name'))).toBe(true);       // required, absent
    expect(missing.some((x) => x.includes('Detail'))).toBe(false);    // visible but NOT required
  });

  it('invalid select option is rejected', () => {
    expect(validateFormResponse(def(), { name: 'A', reason: 'bogus' }).some((x) => x.includes('invalid option'))).toBe(true);
  });
});
