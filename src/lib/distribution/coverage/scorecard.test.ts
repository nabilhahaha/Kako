import { describe, it, expect } from 'vitest';
import { repScorecard, DEFAULT_REP_WEIGHTS } from './scorecard';

describe('rep scorecard (composes KPIs via the Perfect Store scorer)', () => {
  it('scores a full set of KPIs as a weighted average', () => {
    // coverage 90*.4 + strike 80*.3 + collection 70*.2 + quality(100-10=90)*.1 = 36+24+14+9 = 83
    const r = repScorecard({ coveragePct: 90, strikeRatePct: 80, collectionPct: 70, returnRatePct: 10 });
    expect(r.score).toBe(83);
    expect(r.band).toBe('silver'); // >=75
    expect(r.hasData).toBe(true);
    expect(r.pillars.map((p) => p.key).sort()).toEqual(['collection', 'coverage', 'quality', 'strike']);
  });

  it('drops missing pillars and renormalises the rest', () => {
    // only coverage + strike present → weights .4/.3 renormalise to 4:3
    // (90*4 + 80*3)/7 = (360+240)/7 = 85.7 → rounds per scorer
    const r = repScorecard({ coveragePct: 90, strikeRatePct: 80 });
    expect(r.pillars.map((p) => p.key).sort()).toEqual(['coverage', 'strike']);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.score).toBeLessThanOrEqual(86);
  });

  it('inverts return rate into a quality pillar (fewer returns = higher)', () => {
    const low = repScorecard({ coveragePct: null, strikeRatePct: null, returnRatePct: 5 });  // quality 95
    const high = repScorecard({ coveragePct: null, strikeRatePct: null, returnRatePct: 40 }); // quality 60
    expect(low.score).toBeGreaterThan(high.score);
  });

  it('bands gold/poor at the extremes', () => {
    expect(repScorecard({ coveragePct: 100, strikeRatePct: 95, collectionPct: 98, returnRatePct: 2 }).band).toBe('gold');
    expect(repScorecard({ coveragePct: 20, strikeRatePct: 10, collectionPct: 10, returnRatePct: 80 }).band).toBe('none');
  });

  it('reports no data when every pillar is null', () => {
    const r = repScorecard({ coveragePct: null, strikeRatePct: null });
    expect(r.hasData).toBe(false);
    expect(r.score).toBe(0);
  });

  it('exposes default weights summing to 1', () => {
    const w = DEFAULT_REP_WEIGHTS;
    expect(w.coverage + w.strike + w.collection + w.quality).toBeCloseTo(1, 5);
  });
});
