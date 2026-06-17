import { describe, it, expect } from 'vitest';
import {
  timeToReviewMinutes, timeToApproveMinutes, pendingAgeHours, pendingBucket, summarizeSla, returnSlaEnabled,
  slaTier, compareApprovalPriority,
} from './return-sla';

const T = (iso: string) => new Date(iso);

describe('return SLA — pure metrics', () => {
  it('Time To Review = first view − request', () => {
    expect(timeToReviewMinutes({ requestedAt: '2026-06-16T09:00:00Z', firstViewedAt: '2026-06-16T09:30:00Z' })).toBe(30);
    expect(timeToReviewMinutes({ requestedAt: '2026-06-16T09:00:00Z' })).toBeNull(); // not viewed yet
  });

  it('Time To Approve = decision − request', () => {
    expect(timeToApproveMinutes({ requestedAt: '2026-06-16T09:00:00Z', decidedAt: '2026-06-16T11:00:00Z' })).toBe(120);
    expect(timeToApproveMinutes({ requestedAt: '2026-06-16T09:00:00Z' })).toBeNull();
  });

  it('pending age + buckets (> 24h / > 48h)', () => {
    const now = T('2026-06-16T12:00:00Z');
    expect(pendingAgeHours('2026-06-16T06:00:00Z', now)).toBeCloseTo(6);
    expect(pendingBucket('2026-06-16T06:00:00Z', now)).toBe('under_24h');
    expect(pendingBucket('2026-06-15T06:00:00Z', now)).toBe('over_24h');  // 30h
    expect(pendingBucket('2026-06-13T06:00:00Z', now)).toBe('over_48h');  // 78h
  });

  it('summarizeSla averages decided times and counts pending buckets', () => {
    const now = T('2026-06-16T12:00:00Z');
    const decided = [
      { requestedAt: '2026-06-16T09:00:00Z', firstViewedAt: '2026-06-16T09:20:00Z', decidedAt: '2026-06-16T10:00:00Z' }, // review 20, approve 60
      { requestedAt: '2026-06-16T08:00:00Z', firstViewedAt: '2026-06-16T08:40:00Z', decidedAt: '2026-06-16T10:00:00Z' }, // review 40, approve 120
    ];
    const pending = ['2026-06-15T06:00:00Z', '2026-06-13T06:00:00Z']; // 30h (>24), 78h (>48)
    const s = summarizeSla(decided, pending, now);
    expect(s.count).toBe(2);
    expect(s.avgReviewMinutes).toBe(30);
    expect(s.avgApproveMinutes).toBe(90);
    expect(s.pendingOver24h).toBe(2); // both exceed 24h
    expect(s.pendingOver48h).toBe(1); // only the 78h one
  });

  it('slaTier: 2 breach (>48h), 1 warn (>24h), 0 new', () => {
    const now = T('2026-06-16T12:00:00Z');
    expect(slaTier('2026-06-13T06:00:00Z', now)).toBe(2); // 78h
    expect(slaTier('2026-06-15T06:00:00Z', now)).toBe(1); // 30h
    expect(slaTier('2026-06-16T06:00:00Z', now)).toBe(0); // 6h
  });

  it('compareApprovalPriority: SLA breach > value > oldest', () => {
    const now = T('2026-06-16T12:00:00Z');
    const breachLow = { requestedAt: '2026-06-13T00:00:00Z', value: 10 };   // >48h
    const warnHigh = { requestedAt: '2026-06-15T06:00:00Z', value: 9999 };  // >24h
    const newHigh = { requestedAt: '2026-06-16T06:00:00Z', value: 5000 };   // new
    // SLA tier dominates value: the >48h breach sorts before the high-value warn.
    expect(compareApprovalPriority(breachLow, warnHigh, now)).toBeLessThan(0);
    expect(compareApprovalPriority(warnHigh, newHigh, now)).toBeLessThan(0);

    const sorted = [newHigh, breachLow, warnHigh].sort((a, b) => compareApprovalPriority(a, b, now));
    expect(sorted).toEqual([breachLow, warnHigh, newHigh]);
  });

  it('compareApprovalPriority tie-breaks equal tier by value then oldest', () => {
    const now = T('2026-06-16T12:00:00Z');
    const a = { requestedAt: '2026-06-16T06:00:00Z', value: 100 };
    const b = { requestedAt: '2026-06-16T08:00:00Z', value: 500 };
    expect(compareApprovalPriority(a, b, now)).toBeGreaterThan(0); // b higher value → first
    const c = { requestedAt: '2026-06-16T06:00:00Z', value: 500 };
    const d = { requestedAt: '2026-06-16T09:00:00Z', value: 500 };
    expect(compareApprovalPriority(c, d, now)).toBeLessThan(0); // equal value → c older → first
  });

  it('returnSlaEnabled reads the platform.return_approval_sla flag', () => {
    expect(returnSlaEnabled({ 'platform.return_approval_sla': true })).toBe(true);
    expect(returnSlaEnabled({})).toBe(false);
    expect(returnSlaEnabled(null)).toBe(false);
  });
});
