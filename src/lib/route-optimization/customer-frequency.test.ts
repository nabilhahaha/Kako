import { describe, it, expect } from 'vitest';
import { customerLevelFrequency, effectiveCustomerFrequency, resolveFrequencyForCustomer } from './customer-frequency';
import { DEFAULT_FREQUENCY_RULES } from './frequency';
import type { VisitFrequency } from './visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const triWeekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 3 };
const monthly: VisitFrequency = { unit: 'month', everyN: 1, visitsPerCycle: 1 };

describe('customerLevelFrequency', () => {
  it('parses a stored token, defaulting source to manual', () => {
    expect(customerLevelFrequency({ visit_frequency: 'monthly' })).toEqual({ frequency: monthly, source: 'manual' });
  });
  it('reports import provenance', () => {
    expect(customerLevelFrequency({ visit_frequency: 'week/1/3', visit_frequency_source: 'import' }))
      .toEqual({ frequency: triWeekly, source: 'import' });
  });
  it('null/unparseable ⇒ null (falls through to classification today)', () => {
    expect(customerLevelFrequency({ visit_frequency: null })).toBeNull();
    expect(customerLevelFrequency({ visit_frequency: 'garbage' })).toBeNull();
  });
});

describe('effectiveCustomerFrequency', () => {
  it('preserves current behaviour: no customer value ⇒ classification wins', () => {
    const r = effectiveCustomerFrequency({
      customerRow: { visit_frequency: null },
      classification: triWeekly,
      system: weekly,
    });
    expect(r.frequency).toEqual(triWeekly);
    expect(r.source).toBe('classification');
  });

  it('customer-level value is authoritative over classification', () => {
    const r = effectiveCustomerFrequency({
      customerRow: { visit_frequency: 'monthly', visit_frequency_source: 'manual' },
      classification: triWeekly,
    });
    expect(r.frequency).toEqual(monthly);
    expect(r.source).toBe('manual');
    expect(r.recommendation).toEqual(triWeekly);
  });

  it('company override lets classification supersede customer-level', () => {
    const r = effectiveCustomerFrequency({
      customerRow: { visit_frequency: 'monthly' },
      classification: triWeekly,
      classificationCanOverride: true,
    });
    expect(r.frequency).toEqual(triWeekly);
    expect(r.source).toBe('classification');
  });

  it('falls to system default when nothing else is set', () => {
    const r = effectiveCustomerFrequency({ customerRow: { visit_frequency: null }, system: weekly });
    expect(r.frequency).toEqual(weekly);
    expect(r.source).toBe('system');
  });
});

describe('resolveFrequencyForCustomer (FR-5 generation bridge)', () => {
  it('classification grade fills when no customer-level value', () => {
    const r = resolveFrequencyForCustomer({ customerRow: { visit_frequency: null }, gradeCode: 'a', rules: DEFAULT_FREQUENCY_RULES });
    expect(r.frequency).toEqual(triWeekly); // A → 3/week
    expect(r.source).toBe('classification');
  });
  it('customer-level value overrides the grade', () => {
    const r = resolveFrequencyForCustomer({ customerRow: { visit_frequency: 'monthly', visit_frequency_source: 'import' }, gradeCode: 'a', rules: DEFAULT_FREQUENCY_RULES });
    expect(r.frequency).toEqual(monthly);
    expect(r.source).toBe('import');
    expect(r.recommendation).toEqual(triWeekly);
  });
  it('no grade + no customer value ⇒ null (skipped by the generator)', () => {
    const r = resolveFrequencyForCustomer({ customerRow: { visit_frequency: null }, gradeCode: null, rules: DEFAULT_FREQUENCY_RULES });
    expect(r.frequency).toBeNull();
  });
  it('company override lets grade supersede customer value', () => {
    const r = resolveFrequencyForCustomer({ customerRow: { visit_frequency: 'monthly' }, gradeCode: 'a', rules: DEFAULT_FREQUENCY_RULES, classificationCanOverride: true });
    expect(r.frequency).toEqual(triWeekly);
    expect(r.source).toBe('classification');
  });
});
