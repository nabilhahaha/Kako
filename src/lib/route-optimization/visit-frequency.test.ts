import { describe, it, expect } from 'vitest';
import {
  makeFrequency,
  parseFrequency,
  formatFrequency,
  frequencyToVisitsPerWeek,
  frequencyFromVisitsPerWeek,
  frequencyToJourneyEnum,
  WEEKS_PER_MONTH,
  type VisitFrequency,
} from './visit-frequency';

describe('makeFrequency', () => {
  it('builds a normalized value and rejects bad input', () => {
    expect(makeFrequency('week', 1, 3)).toEqual({ unit: 'week', everyN: 1, visitsPerCycle: 3 });
    expect(makeFrequency('week', 0, 1)).toBeNull();
    expect(makeFrequency('week', 1, 0)).toBeNull();
    // @ts-expect-error invalid unit
    expect(makeFrequency('day', 1, 1)).toBeNull();
    expect(makeFrequency('month', 2.9, 1.9)).toEqual({ unit: 'month', everyN: 2, visitsPerCycle: 1 });
  });
});

describe('parse/format round-trip', () => {
  const cases: [string, VisitFrequency][] = [
    ['weekly', { unit: 'week', everyN: 1, visitsPerCycle: 1 }],
    ['biweekly', { unit: 'week', everyN: 2, visitsPerCycle: 1 }],
    ['monthly', { unit: 'month', everyN: 1, visitsPerCycle: 1 }],
    ['annual', { unit: 'year', everyN: 1, visitsPerCycle: 1 }],
  ];
  it.each(cases)('alias %s parses + formats canonically', (token, freq) => {
    expect(parseFrequency(token)).toEqual(freq);
    expect(formatFrequency(freq)).toBe(token);
  });
  it('parses the structured form', () => {
    expect(parseFrequency('week/1/3')).toEqual({ unit: 'week', everyN: 1, visitsPerCycle: 3 });
    expect(parseFrequency('month/2/1')).toEqual({ unit: 'month', everyN: 2, visitsPerCycle: 1 });
  });
  it('formats non-alias values structurally', () => {
    expect(formatFrequency({ unit: 'week', everyN: 1, visitsPerCycle: 3 })).toBe('week/1/3');
    expect(formatFrequency({ unit: 'month', everyN: 2, visitsPerCycle: 1 })).toBe('month/2/1');
  });
  it('treats yearly as an input alias for annual', () => {
    expect(parseFrequency('yearly')).toEqual(parseFrequency('annual'));
  });
  it('returns null for junk / empty', () => {
    expect(parseFrequency('')).toBeNull();
    expect(parseFrequency(null)).toBeNull();
    expect(parseFrequency('nonsense')).toBeNull();
    expect(parseFrequency('week/0/1')).toBeNull();
  });
});

describe('frequencyToVisitsPerWeek', () => {
  it('weekly cadences', () => {
    expect(frequencyToVisitsPerWeek({ unit: 'week', everyN: 1, visitsPerCycle: 1 })).toBe(1);
    expect(frequencyToVisitsPerWeek({ unit: 'week', everyN: 1, visitsPerCycle: 3 })).toBe(3);
    expect(frequencyToVisitsPerWeek({ unit: 'week', everyN: 2, visitsPerCycle: 1 })).toBe(0.5);
  });
  it('monthly / annual cadences', () => {
    expect(frequencyToVisitsPerWeek({ unit: 'month', everyN: 1, visitsPerCycle: 1 })).toBeCloseTo(1 / WEEKS_PER_MONTH, 5);
    expect(frequencyToVisitsPerWeek({ unit: 'year', everyN: 1, visitsPerCycle: 1 })).toBeCloseTo(1 / 52, 5);
  });
});

describe('frequencyFromVisitsPerWeek (classification bucket parity)', () => {
  it('A/B/C/D rule rates map to the expected cadence', () => {
    expect(frequencyFromVisitsPerWeek(3)).toEqual({ unit: 'week', everyN: 1, visitsPerCycle: 3 }); // A
    expect(frequencyFromVisitsPerWeek(2)).toEqual({ unit: 'week', everyN: 1, visitsPerCycle: 2 }); // B
    expect(frequencyFromVisitsPerWeek(1)).toEqual({ unit: 'week', everyN: 1, visitsPerCycle: 1 }); // C
    expect(frequencyFromVisitsPerWeek(0.5)).toEqual({ unit: 'week', everyN: 2, visitsPerCycle: 1 }); // D biweekly
    expect(frequencyFromVisitsPerWeek(0.2)).toEqual({ unit: 'month', everyN: 1, visitsPerCycle: 1 }); // monthly-ish
  });
  it('non-positive ⇒ null', () => {
    expect(frequencyFromVisitsPerWeek(0)).toBeNull();
    expect(frequencyFromVisitsPerWeek(-1)).toBeNull();
  });
});

describe('frequencyToJourneyEnum (back-compat with journey_plans)', () => {
  it('maps onto weekly|biweekly|monthly', () => {
    expect(frequencyToJourneyEnum({ unit: 'week', everyN: 1, visitsPerCycle: 1 })).toBe('weekly');
    expect(frequencyToJourneyEnum({ unit: 'week', everyN: 1, visitsPerCycle: 3 })).toBe('weekly'); // multi-weekly → weekly days
    expect(frequencyToJourneyEnum({ unit: 'week', everyN: 2, visitsPerCycle: 1 })).toBe('biweekly');
    expect(frequencyToJourneyEnum({ unit: 'month', everyN: 1, visitsPerCycle: 1 })).toBe('monthly');
    expect(frequencyToJourneyEnum({ unit: 'year', everyN: 1, visitsPerCycle: 1 })).toBe('monthly'); // coarsest bucket
  });
});
