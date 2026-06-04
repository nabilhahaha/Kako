import { describe, it, expect } from 'vitest';
import { rollupTerritory, territorySummary, type RouteCoverage } from './territory';

const rows: RouteCoverage[] = [
  { route: 'R-Good', coveragePct: 90 },
  { route: 'R-Critical', coveragePct: 30 },
  { route: 'R-Attention', coveragePct: 60 },
  { route: 'R-Unknown', coveragePct: null },
];

describe('territory', () => {
  it('rolls up worst-first (critical → attention → unknown → good)', () => {
    expect(rollupTerritory(rows).map((r) => r.route)).toEqual(['R-Critical', 'R-Attention', 'R-Unknown', 'R-Good']);
  });
  it('summarizes counts + avg coverage of known routes', () => {
    const s = territorySummary(rows);
    expect(s.routes).toBe(4);
    expect(s.good).toBe(1);
    expect(s.attention).toBe(1);
    expect(s.critical).toBe(1);
    expect(s.avgCoverage).toBe(60); // (90+30+60)/3
  });
});
