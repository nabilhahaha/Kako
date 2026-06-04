import { describe, it, expect } from 'vitest';
import { coachingTips } from './coaching';

describe('coaching (deterministic, no AI)', () => {
  it('flags low coverage, gps, out-of-route, skipped — most severe first', () => {
    const tips = coachingTips({ coveragePct: 30, minCoveragePct: 80, gpsViolations: 2, outOfRoute: 1, skipped: 3 }, 'en');
    expect(tips[0].severity).toBe('danger'); // coverage < min/2
    expect(tips.map((t) => t.code)).toEqual(expect.arrayContaining(['low_coverage', 'gps', 'out_of_route', 'skipped']));
  });
  it('all-good when nothing is wrong', () => {
    const tips = coachingTips({ coveragePct: 95, minCoveragePct: 80 }, 'en');
    expect(tips).toHaveLength(1);
    expect(tips[0].code).toBe('all_good');
  });
  it('localizes to Arabic', () => {
    const tips = coachingTips({ skipped: 1 }, 'ar');
    expect(tips.some((t) => /[؀-ۿ]/.test(t.text))).toBe(true);
  });
});
