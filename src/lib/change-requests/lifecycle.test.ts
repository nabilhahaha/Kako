import { describe, it, expect } from 'vitest';
import {
  canTransition,
  isTerminal,
  valuesEqual,
  diffChanges,
  disallowedFields,
  missingDocTypes,
  evaluateValidation,
  registerValidator,
} from './index';

describe('change-requests/state machine', () => {
  it('allows only legal transitions', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'pending')).toBe(true);
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('approved', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'applying')).toBe(true);
    expect(canTransition('applying', 'applied')).toBe(true);
    expect(canTransition('applying', 'partially_applied')).toBe(true);
    // illegal
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('applied', 'pending')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
  });
  it('flags terminal states', () => {
    expect(isTerminal('applied')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('scheduled')).toBe(false);
  });
});

describe('change-requests/diff', () => {
  it('valuesEqual: numeric vs normalized string', () => {
    expect(valuesEqual(100, '100')).toBe(true);
    expect(valuesEqual(null, '')).toBe(true);
    expect(valuesEqual('A', 'A')).toBe(true);
    expect(valuesEqual('A', 'B')).toBe(false);
    expect(valuesEqual(1, 2)).toBe(false);
  });
  it('diffChanges returns only changed, allowed fields', () => {
    const current = { name: 'ACME', credit_limit: 100, secret: 'x' };
    const proposed = { name: 'ACME', credit_limit: 200, secret: 'y' };
    // whitelist excludes `secret`; name unchanged → only credit_limit
    const d = diffChanges(current, proposed, ['name', 'credit_limit']);
    expect(d).toEqual([{ fieldKey: 'credit_limit', oldValue: 100, newValue: 200 }]);
  });
  it('diffChanges with null whitelist allows any field', () => {
    const d = diffChanges({ a: 1 }, { a: 2, b: 3 }, null);
    expect(d.map((x) => x.fieldKey).sort()).toEqual(['a', 'b']);
  });
  it('disallowedFields flags fields outside the whitelist', () => {
    expect(disallowedFields({ a: 1, z: 2 }, ['a'])).toEqual(['z']);
    expect(disallowedFields({ a: 1 }, null)).toEqual([]);
  });
  it('missingDocTypes returns required types not yet present (deduped)', () => {
    expect(missingDocTypes(['cr_copy', 'vat_certificate'], ['cr_copy'])).toEqual(['vat_certificate']);
    expect(missingDocTypes(['cr_copy', 'cr_copy'], [])).toEqual(['cr_copy']);
    expect(missingDocTypes([], ['anything'])).toEqual([]);
    expect(missingDocTypes(['cr_copy'], ['cr_copy', 'photo'])).toEqual([]);
  });
});

describe('change-requests/validation', () => {
  it('required / type / min / max / regex / enum', () => {
    const spec = {
      rules: [
        { field: 'vat', required: true, regex: '^3[0-9]{14}$' },
        { field: 'limit', type: 'number' as const, min: 0, max: 100 },
        { field: 'channel', enum: ['a', 'b'] },
      ],
    };
    // all good
    expect(evaluateValidation(spec, { vat: '3' + '0'.repeat(14), limit: 50, channel: 'a' }, 'customer').errors).toEqual([]);
    // bad regex, over max, bad enum
    const r = evaluateValidation(spec, { vat: '12345', limit: 200, channel: 'z' }, 'customer').errors;
    expect(r).toEqual([
      { field: 'vat', rule: 'regex' },
      { field: 'limit', rule: 'max' },
      { field: 'channel', rule: 'enum' },
    ]);
  });
  it('required only fires when the field is being changed / empty', () => {
    const spec = { rules: [{ field: 'vat', required: true }] };
    expect(evaluateValidation(spec, { vat: '' }, 'c').errors).toEqual([{ field: 'vat', rule: 'required' }]);
    expect(evaluateValidation(spec, {}, 'c').errors).toEqual([{ field: 'vat', rule: 'required' }]);
    expect(evaluateValidation(spec, { vat: 'x' }, 'c').errors).toEqual([]);
  });
  it('named validators run via the registry', () => {
    registerValidator('even', (v) => (Number(v) % 2 === 0 ? null : 'odd'));
    const spec = { rules: [{ field: 'n', validator: 'even' }] };
    expect(evaluateValidation(spec, { n: 4 }, 'c').errors).toEqual([]);
    expect(evaluateValidation(spec, { n: 3 }, 'c').errors).toEqual([{ field: 'n', rule: 'validator' }]);
  });
  it('collects deferred DB-backed checks (reference, requiresDocType)', () => {
    const spec = {
      rules: [
        { field: 'channel_id', reference: 'erp_channels' },
        { field: 'vat', requiresDocType: 'vat_certificate' },
      ],
    };
    const { deferred } = evaluateValidation(spec, { channel_id: 'ch1', vat: '3' }, 'customer');
    expect(deferred.references).toEqual([{ field: 'channel_id', table: 'erp_channels', value: 'ch1' }]);
    expect(deferred.requiredDocTypes).toEqual(['vat_certificate']);
  });
});
