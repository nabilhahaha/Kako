import { describe, it, expect } from 'vitest';
import { resolveVisitDuration, visitMinutesPerWeek, defaultVisitDurationConfig, DEFAULT_VISIT_DURATION_MIN } from './visit-duration';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };

describe('resolveVisitDuration (precedence)', () => {
  const cfg = { globalDefaultMin: 20, byChannel: { wholesale: 40 }, byClass: { a: 30 } };
  it('falls back to the global default', () => {
    expect(resolveVisitDuration({}, cfg)).toBe(20);
    expect(resolveVisitDuration({ grade: 'c' }, cfg)).toBe(20); // no class override for c
  });
  it('class (grade) overrides global', () => {
    expect(resolveVisitDuration({ grade: 'a' }, cfg)).toBe(30);
  });
  it('channel overrides class', () => {
    expect(resolveVisitDuration({ grade: 'a', channel: 'wholesale' }, cfg)).toBe(40);
  });
  it('customer-specific overrides everything', () => {
    expect(resolveVisitDuration({ durationMin: 55, channel: 'wholesale', grade: 'a' }, cfg)).toBe(55);
  });
  it('default config uses the platform default', () => {
    expect(resolveVisitDuration({}, defaultVisitDurationConfig())).toBe(DEFAULT_VISIT_DURATION_MIN);
  });
});

describe('visitMinutesPerWeek', () => {
  it('= visits/week × resolved duration', () => {
    expect(visitMinutesPerWeek({ frequency: weekly, grade: 'a' }, { globalDefaultMin: 20, byClass: { a: 30 } })).toBe(30);
  });
});
