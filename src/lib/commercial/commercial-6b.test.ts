import { describe, it, expect } from 'vitest';
import {
  computeAchievement,
  forecastFromHistory, forecastAccuracy,
  canTransition, transition, nextStage, buildAuditEntry, MdgTransitionError, type MdgChangeRequest,
} from './index';

describe('targets engine (multi-dimensional achievement + forecast)', () => {
  it('computes achievement, gap, run-rate, forecast, status', () => {
    const r = computeAchievement({ target: 100000, actual: 60000, daysElapsed: 15, daysTotal: 30 });
    expect(r.achievementPct).toBe(60);
    expect(r.gap).toBe(40000);
    expect(r.forecastAchievement).toBe(120000);   // 60000/15*30
    expect(r.status).toBe('ahead');               // forecast ≥ 100%
    expect(r.requiredDailyRunRate).toBeCloseTo(40000 / 15, 1);
  });
  it('flags behind/critical', () => {
    expect(computeAchievement({ target: 100000, actual: 20000, daysElapsed: 20, daysTotal: 30 }).status).toBe('critical');
  });
});

describe('forecasting engine', () => {
  it('forecasts from history with drivers', () => {
    expect(forecastFromHistory([100, 100, 100])).toBe(100);
    expect(forecastFromHistory([100, 100, 100], { seasonalityIndex: 1.2, promotionUpliftPct: 10, growthPct: 5 })).toBe(round(100 * 1.2 * 1.1 * 1.05));
    expect(forecastFromHistory([])).toBe(0);
  });
  it('computes accuracy metrics (MAPE/WAPE/bias)', () => {
    const a = forecastAccuracy([{ actual: 100, forecast: 110 }, { actual: 200, forecast: 180 }]);
    expect(a.bias).toBe(-5);              // ((10)+(-20))/2
    expect(a.wape).toBe(10);              // (10+20)/300
    expect(a.accuracyPct).toBe(90);
    expect(a.mape).toBe(10);              // (10% + 10%)/2
  });
});

function round(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

describe('master data governance engine', () => {
  it('enforces the change-request workflow', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'approved')).toBe(true);
    expect(canTransition('approved', 'draft')).toBe(false);
    expect(transition('rejected', 'draft')).toBe('draft');
    expect(() => transition('draft', 'approved')).toThrow(MdgTransitionError);
  });
  it('advances a configurable approval chain', () => {
    const chain = ['supervisor', 'data_steward'];
    expect(nextStage(chain, null)).toBe('supervisor');
    expect(nextStage(chain, 'supervisor')).toBe('data_steward');
    expect(nextStage(chain, 'data_steward')).toBeNull();   // final → approved
  });
  it('builds an audit entry', () => {
    const req: MdgChangeRequest = { entity: 'customer', entityId: 'C1', field: 'vat', oldValue: 'A', newValue: 'B', reason: 'correction', status: 'approved' };
    const a = buildAuditEntry(req, 'u1', 'steward1', '2026-06-08T00:00:00Z');
    expect(a).toMatchObject({ entity: 'customer', field: 'vat', oldValue: 'A', newValue: 'B', changedBy: 'u1', approvalBy: 'steward1' });
  });
});
