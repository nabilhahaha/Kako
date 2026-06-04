import { describe, it, expect } from 'vitest';
import { achievementPct, scoreStatus, trendDir, deltaPct } from './scorecard';

describe('scorecard', () => {
  it('achievementPct', () => {
    expect(achievementPct(80, 100)).toBe(80);
    expect(achievementPct(120, 100)).toBe(120);
    expect(achievementPct(5, 0)).toBe(100); // no target, has actual
    expect(achievementPct(0, 0)).toBe(0);
    expect(achievementPct(-5, 100)).toBe(0);
  });
  it('scoreStatus bands', () => {
    expect(scoreStatus(120)).toBe('ahead');
    expect(scoreStatus(100)).toBe('ahead');
    expect(scoreStatus(85)).toBe('onTrack');
    expect(scoreStatus(60)).toBe('behind');
    expect(scoreStatus(30)).toBe('critical');
  });
  it('trendDir + deltaPct', () => {
    expect(trendDir(10, 8)).toBe('up');
    expect(trendDir(8, 10)).toBe('down');
    expect(trendDir(5, 5)).toBe('flat');
    expect(deltaPct(110, 100)).toBe(10);
    expect(deltaPct(10, 0)).toBe(0);
  });
});
