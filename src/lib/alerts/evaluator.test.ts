import { describe, it, expect } from 'vitest';
import { planAlertSync } from './evaluator';
import type { AlertCandidate } from './types';

const cand = (k: string): AlertCandidate => ({ dedupeKey: k, title: k, body: k });

describe('alerts/planAlertSync', () => {
  it('raises firing candidates and resolves cleared ones', () => {
    const candidates = [cand('a'), cand('b')];
    const live = ['b', 'c'];               // c is live but no longer firing
    const plan = planAlertSync(candidates, live);
    expect(plan.raise.map((c) => c.dedupeKey)).toEqual(['a', 'b']);
    expect(plan.resolveDedupeKeys).toEqual(['c']);
  });
  it('dedupes candidates by key', () => {
    const plan = planAlertSync([cand('a'), cand('a'), cand('b')], []);
    expect(plan.raise.map((c) => c.dedupeKey)).toEqual(['a', 'b']);
  });
  it('nothing firing → resolve all live', () => {
    expect(planAlertSync([], ['x', 'y']).resolveDedupeKeys).toEqual(['x', 'y']);
  });
  it('all firing → resolve none', () => {
    expect(planAlertSync([cand('x')], ['x']).resolveDedupeKeys).toEqual([]);
  });
});
