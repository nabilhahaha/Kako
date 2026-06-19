import { describe, it, expect } from 'vitest';
import { isVisitDueOn } from './cadence';

// 2026-06-07 is a Sunday; +7 = 06-14 (Sun), +14 = 06-21 (Sun), +28 = 07-05 (Sun).
const base = { dayOfWeek: 'sun', effectiveFrom: '2026-06-07' };

describe('isVisitDueOn — day-of-week + range', () => {
  it('false when the date is not the plan day-of-week', () => {
    expect(isVisitDueOn({ ...base, frequency: 'weekly' }, '2026-06-08')).toBe(false); // Monday
  });
  it('false before effective_from / after effective_to', () => {
    expect(isVisitDueOn({ ...base, frequency: 'weekly' }, '2026-05-31')).toBe(false);
    expect(isVisitDueOn({ ...base, frequency: 'weekly', effectiveTo: '2026-06-10' }, '2026-06-14')).toBe(false);
  });
});

describe('isVisitDueOn — cadence', () => {
  it('weekly is due every matching Sunday', () => {
    for (const d of ['2026-06-07', '2026-06-14', '2026-06-21', '2026-07-05']) {
      expect(isVisitDueOn({ ...base, frequency: 'weekly' }, d)).toBe(true);
    }
  });
  it('biweekly is due on even weeks only', () => {
    expect(isVisitDueOn({ ...base, frequency: 'biweekly' }, '2026-06-07')).toBe(true);  // week 0
    expect(isVisitDueOn({ ...base, frequency: 'biweekly' }, '2026-06-14')).toBe(false); // week 1
    expect(isVisitDueOn({ ...base, frequency: 'biweekly' }, '2026-06-21')).toBe(true);  // week 2
  });
  it('monthly is due every 4th matching week', () => {
    expect(isVisitDueOn({ ...base, frequency: 'monthly' }, '2026-06-07')).toBe(true);  // week 0
    expect(isVisitDueOn({ ...base, frequency: 'monthly' }, '2026-06-14')).toBe(false); // week 1
    expect(isVisitDueOn({ ...base, frequency: 'monthly' }, '2026-07-05')).toBe(true);  // week 4
  });
  it('unknown frequency is treated as always-due (forward-compatible)', () => {
    expect(isVisitDueOn({ ...base, frequency: 'custom' }, '2026-06-14')).toBe(true);
  });
});
