import { describe, it, expect } from 'vitest';
import { resolveVisitFrequency, classificationFrequency } from './frequency-resolver';
import type { VisitFrequency } from './visit-frequency';
import { DEFAULT_FREQUENCY_RULES } from './frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const triWeekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 3 };
const biweekly: VisitFrequency = { unit: 'week', everyN: 2, visitsPerCycle: 1 };
const monthly: VisitFrequency = { unit: 'month', everyN: 1, visitsPerCycle: 1 };

describe('resolveVisitFrequency — precedence', () => {
  it('customer-level wins over everything (primary source of truth)', () => {
    const r = resolveVisitFrequency({
      customer: monthly,
      planning: weekly,
      classification: triWeekly,
      system: weekly,
    });
    expect(r.frequency).toEqual(monthly);
    expect(r.source).toBe('manual');
  });

  it('reports import provenance when customer value came from import', () => {
    const r = resolveVisitFrequency({ customer: monthly, customerSource: 'import', classification: weekly });
    expect(r.source).toBe('import');
  });

  it('falls to planning when no customer value', () => {
    const r = resolveVisitFrequency({ planning: biweekly, classification: triWeekly, system: weekly });
    expect(r.frequency).toEqual(biweekly);
    expect(r.source).toBe('planning');
  });

  it('falls to classification when no customer/planning value', () => {
    const r = resolveVisitFrequency({ classification: triWeekly, system: weekly });
    expect(r.frequency).toEqual(triWeekly);
    expect(r.source).toBe('classification');
  });

  it('falls to system default last', () => {
    const r = resolveVisitFrequency({ system: weekly });
    expect(r.frequency).toEqual(weekly);
    expect(r.source).toBe('system');
  });

  it('returns null when nothing is configured', () => {
    const r = resolveVisitFrequency({});
    expect(r.frequency).toBeNull();
    expect(r.source).toBe('system');
    expect(r.recommendation).toBeNull();
  });
});

describe('resolveVisitFrequency — recommendation surfacing', () => {
  it('always exposes the classification value as recommendation, even when overridden by customer', () => {
    const r = resolveVisitFrequency({ customer: monthly, classification: triWeekly });
    expect(r.frequency).toEqual(monthly);       // customer authoritative
    expect(r.recommendation).toEqual(triWeekly); // classification still surfaced
  });
});

describe('resolveVisitFrequency — classificationCanOverride policy', () => {
  it('classification supersedes customer-level ONLY when the company opts in', () => {
    const r = resolveVisitFrequency({
      customer: monthly,
      classification: triWeekly,
      policy: { classificationCanOverride: true },
    });
    expect(r.frequency).toEqual(triWeekly);
    expect(r.source).toBe('classification');
  });

  it('override flag has no effect when there is no classification value', () => {
    const r = resolveVisitFrequency({
      customer: monthly,
      policy: { classificationCanOverride: true },
    });
    expect(r.frequency).toEqual(monthly);
    expect(r.source).toBe('manual');
  });

  it('default policy keeps customer-level authoritative', () => {
    const r = resolveVisitFrequency({ customer: monthly, classification: triWeekly });
    expect(r.source).toBe('manual');
  });
});

describe('classificationFrequency bridge', () => {
  it('maps A/B/C/D default rules to cadences', () => {
    expect(classificationFrequency(DEFAULT_FREQUENCY_RULES, 'a')).toEqual(triWeekly);
    expect(classificationFrequency(DEFAULT_FREQUENCY_RULES, 'c')).toEqual(weekly);
    expect(classificationFrequency(DEFAULT_FREQUENCY_RULES, 'd')).toEqual(biweekly);
  });
  it('returns null for an unknown classification', () => {
    expect(classificationFrequency(DEFAULT_FREQUENCY_RULES, 'z')).toBeNull();
    expect(classificationFrequency(DEFAULT_FREQUENCY_RULES, '')).toBeNull();
  });
});
