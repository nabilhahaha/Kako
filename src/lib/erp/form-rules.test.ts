import { describe, it, expect } from 'vitest';
import { evalCondition, computeVisibility, isRequired, validateValue, validateSubmission, type RuleField } from './form-rules';

describe('form-rules · evalCondition', () => {
  it('mirrors the workflow ops (eq/neq/gt/lt/in) + extensions', () => {
    expect(evalCondition({ when: 'k', op: 'eq', value: 'a' }, { k: 'a' })).toBe(true);
    expect(evalCondition({ when: 'k', op: 'neq', value: 'a' }, { k: 'b' })).toBe(true);
    expect(evalCondition({ when: 'k', op: 'gt', value: 10 }, { k: 15 })).toBe(true);
    expect(evalCondition({ when: 'k', op: 'lt', value: 10 }, { k: 15 })).toBe(false);
    expect(evalCondition({ when: 'k', op: 'gte', value: 10 }, { k: 10 })).toBe(true);
    expect(evalCondition({ when: 'k', op: 'in', value: ['x', 'y'] }, { k: 'y' })).toBe(true);
    expect(evalCondition({ when: 'k', op: 'exists' }, { k: '' })).toBe(false);
    expect(evalCondition(null, {})).toBe(true); // no condition = always true
  });
});

describe('form-rules · visibility + section conditions', () => {
  const fields: RuleField[] = [
    { key: 'sec', type: 'section', required: false, visibility: { when: 'show_sec', op: 'eq', value: 'yes' } },
    { key: 'a', type: 'text', required: false },
    { key: 'b', type: 'text', required: false, visibility: { when: 'kind', op: 'eq', value: 'detail' } },
  ];
  it('hides a field whose section is hidden, and respects field visibility', () => {
    const v = computeVisibility(fields, { show_sec: 'no', kind: 'detail' });
    expect(v.sec).toBe(false);
    expect(v.a).toBe(false); // under a hidden section
    expect(v.b).toBe(false);
    const v2 = computeVisibility(fields, { show_sec: 'yes', kind: 'detail' });
    expect(v2.a).toBe(true);
    expect(v2.b).toBe(true);
    const v3 = computeVisibility(fields, { show_sec: 'yes', kind: 'other' });
    expect(v3.b).toBe(false); // field-level visibility fails
  });
});

describe('form-rules · required (incl. conditional)', () => {
  it('honors required and requiredWhen', () => {
    expect(isRequired({ key: 'x', type: 'text', required: true }, {})).toBe(true);
    expect(isRequired({ key: 'x', type: 'text', required: false, validation: { requiredWhen: { when: 'k', op: 'eq', value: '1' } } }, { k: '1' })).toBe(true);
    expect(isRequired({ key: 'x', type: 'text', required: false, validation: { requiredWhen: { when: 'k', op: 'eq', value: '1' } } }, { k: '2' })).toBe(false);
  });
});

describe('form-rules · validation', () => {
  it('enforces length/range/regex/allowed', () => {
    expect(validateValue({ key: 'n', type: 'number', required: false, validation: { min: 0, max: 10 } }, 15)).toBe('max');
    expect(validateValue({ key: 't', type: 'text', required: false, validation: { minLen: 3 } }, 'ab')).toBe('minLen');
    expect(validateValue({ key: 't', type: 'text', required: false, validation: { regex: '^[A-Z]+$' } }, 'abc')).toBe('regex');
    expect(validateValue({ key: 'd', type: 'dropdown', required: false, options: [{ value: 'x', label: 'X' }] }, 'z')).toBe('allowed');
    expect(validateValue({ key: 't', type: 'text', required: false }, '')).toBeNull(); // empty is fine (required handles it)
  });
});

describe('form-rules · validateSubmission', () => {
  const fields: RuleField[] = [
    { key: 'name', type: 'text', required: true, validation: { minLen: 2 } },
    { key: 'amount', type: 'number', required: false, validation: { min: 0, requiredWhen: { when: 'kind', op: 'eq', value: 'paid' } } },
    { key: 'hidden', type: 'text', required: true, visibility: { when: 'kind', op: 'eq', value: 'never' } },
  ];
  it('skips hidden fields, enforces required + conditional-required + validation', () => {
    expect(validateSubmission(fields, { name: 'Acme', kind: 'free' })).toEqual({});
    expect(validateSubmission(fields, { name: '', kind: 'free' })).toEqual({ name: 'required' });
    expect(validateSubmission(fields, { name: 'Acme', kind: 'paid' })).toEqual({ amount: 'required' });
    expect(validateSubmission(fields, { name: 'Acme', kind: 'paid', amount: -5 })).toEqual({ amount: 'min' });
  });
});
