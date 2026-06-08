import { describe, it, expect } from 'vitest';
import type { AccessLevel } from '@/lib/erp/field-governance';
import {
  fieldAccess, resolveFormFields, validateGovernedResponse, applyFormGovernance,
  type FormDefinition, type FormField,
} from './index';

const def = (): FormDefinition => ({
  sections: [{ key: 's', title: 'S', fields: [
    { key: 'phone', label: 'Phone', type: 'text', governanceKey: 'phone' },
    { key: 'email', label: 'Email', type: 'text', governanceKey: 'email' },
    { key: 'reason', label: 'Reason', type: 'select', required: true, options: [{ value: 'a' }, { value: 'b' }] },
    { key: 'detail', label: 'Detail', type: 'text', showWhen: { field: 'reason', equals: 'b' } },
  ] }],
});

const gov = (m: Record<string, AccessLevel>) => m;

describe('form-builder/governance · fieldAccess', () => {
  it('is the governed level via governanceKey; ungoverned → edit', () => {
    const phone = def().sections[0].fields[0] as FormField;
    expect(fieldAccess(phone, gov({ phone: 'view' }))).toBe('view');
    expect(fieldAccess(phone, gov({}))).toBe('edit');
    const reason = def().sections[0].fields[2] as FormField; // no governanceKey
    expect(fieldAccess(reason, gov({ phone: 'hidden' }))).toBe('edit');
  });
});

describe('form-builder/governance · resolveFormFields', () => {
  it("gov 'hidden' is not visible; gov 'required' is required; showWhen honored", () => {
    const r = resolveFormFields(def(), { reason: 'b' }, gov({ email: 'hidden', phone: 'required' }));
    const by = new Map(r.map((x) => [x.field.key, x]));
    expect(by.get('email')!.visible).toBe(false);          // gov hidden
    expect(by.get('phone')!.required).toBe(true);          // gov required
    expect(by.get('detail')!.visible).toBe(true);          // reason === b
    expect(resolveFormFields(def(), { reason: 'a' }, gov({})).find((x) => x.field.key === 'detail')!.visible).toBe(false);
  });
  it("access 'view' marks read-only", () => {
    const r = resolveFormFields(def(), {}, gov({ phone: 'view' }));
    expect(r.find((x) => x.field.key === 'phone')!.readOnly).toBe(true);
  });
});

describe('form-builder/governance · validateGovernedResponse', () => {
  it('enforces gov-required, skips hidden/read-only, validates options', () => {
    const missing = validateGovernedResponse(def(), { reason: 'a' }, gov({ phone: 'required' }));
    expect(missing.some((p) => p.includes('Phone'))).toBe(true);     // gov required, empty
    const okp = validateGovernedResponse(def(), { reason: 'a', phone: '055' }, gov({ phone: 'required' }));
    expect(okp).toEqual([]);
    // read-only field with a stray value is not the user's to fill → not validated.
    expect(validateGovernedResponse(def(), { reason: 'a', phone: 'x' }, gov({ phone: 'view' }))).toEqual([]);
    // invalid select option rejected.
    expect(validateGovernedResponse(def(), { reason: 'z' }, gov({})).some((p) => p.includes('invalid option'))).toBe(true);
  });
});

describe('form-builder/governance · applyFormGovernance', () => {
  it('drops hidden/read-only values and reports missing required', () => {
    const out = applyFormGovernance(def(), { phone: 'x', email: 'e', reason: 'a' }, gov({ phone: 'view', email: 'hidden' }));
    expect(out.answers).toEqual({ reason: 'a' });                    // phone(view)+email(hidden) stripped
    expect(out.missingRequired).toEqual([]);
    const missing = applyFormGovernance(def(), { reason: 'a' }, gov({ email: 'required' }));
    expect(missing.missingRequired).toContain('email');
  });
});
