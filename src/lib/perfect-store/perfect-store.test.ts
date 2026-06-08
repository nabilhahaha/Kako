import { describe, it, expect } from 'vitest';
import {
  PERFECT_STORE_ENABLED,
  resolveScorecard, scoreOutlet, type Scorecard,
  complianceLeaderboard, teamScorecard, scoreTrend, type OutletScoreRow,
} from './index';

const scorecards: Scorecard[] = [
  { id: 'base', name: 'Default', pillarWeights: [{ key: 'msl', weight: 0.4 }, { key: 'osa', weight: 0.3 }, { key: 'visibility', weight: 0.3 }] },
  { id: 'mt', name: 'Modern Trade', channel: 'modern', pillarWeights: [{ key: 'msl', weight: 0.5 }, { key: 'osa', weight: 0.5 }] },
  { id: 'mt-ka', name: 'MT Key Account', channel: 'modern', customerType: 'key_account', priority: 10, pillarWeights: [{ key: 'msl', weight: 1 }] },
];

describe('perfect-store/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_PERFECT_STORE;
    delete process.env.KAKO_PERFECT_STORE;
    expect(PERFECT_STORE_ENABLED()).toBe(false);
    process.env.KAKO_PERFECT_STORE = '1';
    expect(PERFECT_STORE_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_PERFECT_STORE; else process.env.KAKO_PERFECT_STORE = prev;
  });
});

describe('configurable scorecard resolution (most specific wins)', () => {
  it('picks the most specific matching scorecard', () => {
    expect(resolveScorecard(scorecards, { channel: 'traditional' })!.id).toBe('base');      // no specific match → base (0 specificity)
    expect(resolveScorecard(scorecards, { channel: 'modern' })!.id).toBe('mt');             // channel match
    expect(resolveScorecard(scorecards, { channel: 'modern', customerType: 'key_account' })!.id).toBe('mt-ka'); // 2 dims
  });
  it('disqualifies scorecards whose set dimension mismatches', () => {
    // 'mt' requires channel=modern; a traditional outlet must not match it
    const r = resolveScorecard([scorecards[1]], { channel: 'traditional' });
    expect(r).toBeUndefined();
  });
});

describe('scoreOutlet (reuses perfectStorePillars)', () => {
  it('weights pillars + bands; null pillars drop out + renormalise', () => {
    const s = scoreOutlet(scorecards[0], { msl: 100, osa: 50, visibility: 100 });
    // (0.4*100 + 0.3*50 + 0.3*100)/1 = 85
    expect(s.score).toBe(85);
    expect(s.band).toBe('silver');
    const partial = scoreOutlet(scorecards[0], { msl: 100, osa: null, visibility: 100 });
    // osa drops → (0.4*100 + 0.3*100)/0.7 = 100
    expect(partial.score).toBe(100);
    expect(partial.band).toBe('gold');
  });
  it('no data → band none', () => {
    expect(scoreOutlet(scorecards[0], { msl: null, osa: null, visibility: null }).band).toBe('none');
  });
});

describe('leaderboard + team + trend', () => {
  const rows: OutletScoreRow[] = [
    { customerId: 'C1', salesmanId: 'S1', score: 90, band: 'gold' },
    { customerId: 'C2', salesmanId: 'S1', score: 60, band: 'bronze' },
    { customerId: 'C3', salesmanId: 'S2', score: 40, band: 'none' },
  ];
  it('ranks outlets + teams', () => {
    expect(complianceLeaderboard(rows)[0].customerId).toBe('C1');
    const teams = teamScorecard(rows);
    expect(teams[0].salesmanId).toBe('S1');
    expect(teams[0].averageScore).toBe(75);
    expect(teams[0].perfectStores).toBe(1);
  });
  it('computes trend direction', () => {
    expect(scoreTrend([{ period: '2026-01', score: 60 }, { period: '2026-02', score: 80 }]).direction).toBe('improving');
    expect(scoreTrend([{ period: '2026-01', score: 80 }, { period: '2026-02', score: 70 }]).direction).toBe('declining');
  });
});
