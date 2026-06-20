import { describe, it, expect } from 'vitest';
import { isVisitDueOn, weekIntervalFor } from './cadence';

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

describe('weekIntervalFor (FR-6)', () => {
  it('maps enum + token + custom to a whole-week interval', () => {
    expect(weekIntervalFor('weekly')).toBe(1);
    expect(weekIntervalFor('biweekly')).toBe(2);
    expect(weekIntervalFor('monthly')).toBe(4);
    expect(weekIntervalFor('annual')).toBe(52);
    expect(weekIntervalFor('month/2/1')).toBe(8);   // every 2 months
    expect(weekIntervalFor('year/1/1')).toBe(52);
    expect(weekIntervalFor('nonsense')).toBeNull(); // unknown → always due
  });
});

describe('isVisitDueOn — FR-6 annual / custom (token authoritative)', () => {
  it('annual is due once every 52 weeks', () => {
    expect(isVisitDueOn({ ...base, frequency: 'monthly', frequencyToken: 'annual' }, '2026-06-07')).toBe(true);   // week 0
    expect(isVisitDueOn({ ...base, frequency: 'monthly', frequencyToken: 'annual' }, '2026-07-05')).toBe(false);  // week 4
    expect(isVisitDueOn({ ...base, frequency: 'monthly', frequencyToken: 'annual' }, '2027-06-06')).toBe(true);   // week 52 (Sun)
  });
  it('custom every-2-months token = every 8 weeks', () => {
    const p = { ...base, frequency: 'monthly', frequencyToken: 'month/2/1' };
    expect(isVisitDueOn(p, '2026-06-07')).toBe(true);  // week 0
    expect(isVisitDueOn(p, '2026-07-05')).toBe(false); // week 4
    expect(isVisitDueOn(p, '2026-08-02')).toBe(true);  // week 8 (Sun)
  });
  it('token overrides the legacy enum', () => {
    // enum says weekly, token says biweekly → biweekly wins.
    expect(isVisitDueOn({ ...base, frequency: 'weekly', frequencyToken: 'biweekly' }, '2026-06-14')).toBe(false);
  });
});
