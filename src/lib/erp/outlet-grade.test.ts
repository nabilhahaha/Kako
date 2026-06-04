import { describe, it, expect } from 'vitest';
import {
  normalizeMinMax, scoreOutlet, assignGrade, gradeMovement, gradeCohort,
  DEFAULT_GRADE_BANDS, type GradeBand, type FactorWeight,
} from './outlet-grade';

const bands: GradeBand[] = DEFAULT_GRADE_BANDS.map((b, i) => ({ ...b, id: `g${i}` }));

describe('outlet-grade · normalizeMinMax', () => {
  it('min-max scales a cohort to 0..100', () => {
    const m = normalizeMinMax(new Map([['a', 10], ['b', 20], ['c', 30]]));
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(50);
    expect(m.get('c')).toBe(100);
  });
  it('all-equal non-zero → 100; all-zero → 0', () => {
    expect(normalizeMinMax(new Map([['a', 5], ['b', 5]])).get('a')).toBe(100);
    expect(normalizeMinMax(new Map([['a', 0], ['b', 0]])).get('a')).toBe(0);
  });
});

describe('outlet-grade · scoreOutlet', () => {
  const weights: FactorWeight[] = [{ factor: 'sales_value', weight: 0.5 }, { factor: 'msl_compliance', weight: 0.5 }];
  it('weights present factors and renormalises over missing ones', () => {
    expect(scoreOutlet({ sales_value: 80, msl_compliance: 60 }, weights)).toBe(70);
    expect(scoreOutlet({ sales_value: 80 }, weights)).toBe(80); // msl missing → renormalise to sales only
  });
  it('zero when no factor present', () => {
    expect(scoreOutlet({}, weights)).toBe(0);
  });
});

describe('outlet-grade · assignGrade (dynamic bands)', () => {
  it('picks the highest band whose threshold is met', () => {
    expect(assignGrade(90, bands)!.code).toBe('A+');
    expect(assignGrade(72, bands)!.code).toBe('A');
    expect(assignGrade(41, bands)!.code).toBe('C');
    expect(assignGrade(0, bands)!.code).toBe('D');
  });
  it('returns null when below every band', () => {
    expect(assignGrade(-1, [{ id: 'x', code: 'A', label: 'A', minScore: 50, rank: 1 }])).toBeNull();
  });
});

describe('outlet-grade · gradeMovement', () => {
  it('detects upgrade / downgrade / same / new', () => {
    expect(gradeMovement(null, 3)).toBe('new');
    expect(gradeMovement(2, 4)).toBe('upgrade');
    expect(gradeMovement(4, 2)).toBe('downgrade');
    expect(gradeMovement(3, 3)).toBe('same');
  });
});

describe('outlet-grade · gradeCohort', () => {
  it('normalises raw factors, scores, grades and flags movement', () => {
    const result = gradeCohort({
      customerIds: ['big', 'small'],
      rawFactors: { sales_value: new Map([['big', 1000], ['small', 0]]) }, // big→100, small→0
      pctFactors: { msl_compliance: new Map([['big', 100], ['small', 50]]) },
      weights: [{ factor: 'sales_value', weight: 0.5 }, { factor: 'msl_compliance', weight: 0.5 }],
      bands,
      prevRankByCustomer: new Map([['big', 3]]), // was B
    });
    const big = result.find((r) => r.customerId === 'big')!;
    const small = result.find((r) => r.customerId === 'small')!;
    expect(big.score).toBe(100);        // (100*.5 + 100*.5)
    expect(big.grade!.code).toBe('A+');
    expect(big.movement).toBe('upgrade'); // rank 5 > prev 3
    expect(small.score).toBe(25);        // (0*.5 + 50*.5)
    expect(small.grade!.code).toBe('D');
    expect(small.movement).toBe('new');  // no prev rank
  });
});
