import { describe, it, expect } from 'vitest';
import { perfectStoreScore, perfectStoreBand, DEFAULT_PS_WEIGHTS } from './perfect-store';

describe('perfect-store · perfectStoreScore', () => {
  it('weights the three pillars (0.5/0.3/0.2)', () => {
    const r = perfectStoreScore({ mslCompliancePct: 80, surveyScorePct: 90, priceCompliancePct: 100 });
    // 0.5*80 + 0.3*90 + 0.2*100 = 40+27+20 = 87
    expect(r.score).toBe(87);
    expect(r.band).toBe('silver');
    expect(r.hasData).toBe(true);
    expect(r.components.map((c) => c.key)).toEqual(['msl', 'survey', 'price']);
  });

  it('renormalises when a pillar is missing', () => {
    // only msl + survey present → weights 0.5 & 0.3 renormalised to 0.625/0.375
    const r = perfectStoreScore({ mslCompliancePct: 100, surveyScorePct: 60 });
    // (0.5*100 + 0.3*60) / (0.5+0.3) = (50+18)/0.8 = 85
    expect(r.score).toBe(85);
  });

  it('no data → score 0, band none, hasData false', () => {
    const r = perfectStoreScore({});
    expect(r.score).toBe(0);
    expect(r.hasData).toBe(false);
    expect(r.band).toBe('none');
  });

  it('clamps out-of-range inputs', () => {
    const r = perfectStoreScore({ mslCompliancePct: 150 }, { msl: 1, survey: 0, price: 0 });
    expect(r.score).toBe(100);
  });
});

describe('perfect-store · band', () => {
  it('gold/silver/bronze/none thresholds', () => {
    expect(perfectStoreBand(92)).toBe('gold');
    expect(perfectStoreBand(80)).toBe('silver');
    expect(perfectStoreBand(55)).toBe('bronze');
    expect(perfectStoreBand(40)).toBe('none');
    expect(perfectStoreBand(95, false)).toBe('none');
  });
  it('default weights exported', () => {
    expect(DEFAULT_PS_WEIGHTS).toEqual({ msl: 0.5, survey: 0.3, price: 0.2 });
  });
});
