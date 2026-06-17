import { describe, it, expect } from 'vitest';
import { unfinishedActions, VISIT_WORK_ACTIONS } from './visit-session';
import { visitDrivenRouteEnabled } from './sell';

describe('visit-session pure core', () => {
  it('unfinishedActions lists only the actions still flagged true', () => {
    expect(unfinishedActions(null)).toEqual([]);
    expect(unfinishedActions({})).toEqual([]);
    expect(unfinishedActions({ sell: true })).toEqual(['sell']);
    expect(unfinishedActions({ sell: true, collect: true, return: true })).toEqual(VISIT_WORK_ACTIONS);
    expect(unfinishedActions({ sell: false, collect: true })).toEqual(['collect']);
  });
});

describe('visitDrivenRouteEnabled', () => {
  it('is OFF by default and ON only with the platform flag', () => {
    expect(visitDrivenRouteEnabled(null)).toBe(false);
    expect(visitDrivenRouteEnabled({})).toBe(false);
    expect(visitDrivenRouteEnabled({ 'platform.visit_driven_route': false })).toBe(false);
    expect(visitDrivenRouteEnabled({ 'platform.visit_driven_route': true })).toBe(true);
  });
});
