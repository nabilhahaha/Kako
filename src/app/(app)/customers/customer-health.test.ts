import { describe, it, expect } from 'vitest';
import { healthBand, deriveHealthInputs, customerHealth, type HealthBundleInputs } from './customer-health';

describe('healthBand (approved thresholds)', () => {
  it('maps scores to the approved bands', () => {
    expect(healthBand(100)).toBe('healthy');
    expect(healthBand(80)).toBe('healthy');
    expect(healthBand(79)).toBe('at_risk');
    expect(healthBand(60)).toBe('at_risk');
    expect(healthBand(59)).toBe('inactive');
    expect(healthBand(30)).toBe('inactive');
    expect(healthBand(29)).toBe('critical');
    expect(healthBand(0)).toBe('critical');
  });
});

const asOf = '2026-06-19T00:00:00.000Z';
const empty: HealthBundleInputs = {
  lastActivity: { lastVisit: null, lastOrder: null, lastInvoice: null, lastCollection: null, lastReturn: null },
  timeline: [],
  overdueAmount: 0,
};

describe('deriveHealthInputs', () => {
  it('uses the most recent of invoice/order for order recency', () => {
    const i = deriveHealthInputs(
      { ...empty, lastActivity: { ...empty.lastActivity, lastInvoice: '2026-06-15T00:00:00.000Z', lastOrder: '2026-06-10T00:00:00.000Z' } },
      asOf,
    );
    expect(i.daysSinceLastOrder).toBe(4); // 19 − 15
  });

  it('counts returns within the last 90 days', () => {
    const i = deriveHealthInputs(
      { ...empty, timeline: [
        { kind: 'return', date: '2026-06-01T00:00:00.000Z' },
        { kind: 'return', date: '2026-01-01T00:00:00.000Z' }, // >90d
        { kind: 'invoice', date: '2026-06-10T00:00:00.000Z' },
      ] },
      asOf,
    );
    expect(i.returnsLast90).toBe(1);
    expect(i.ordersLast90).toBe(1);
  });

  it('flags overdue from the statement amount', () => {
    expect(deriveHealthInputs({ ...empty, overdueAmount: 500 }, asOf).hasOverdue).toBe(true);
    expect(deriveHealthInputs(empty, asOf).hasOverdue).toBe(false);
  });
});

describe('customerHealth', () => {
  it('a fresh, clean customer is healthy', () => {
    const h = customerHealth(
      { ...empty, lastActivity: { ...empty.lastActivity, lastInvoice: '2026-06-18T00:00:00.000Z', lastVisit: '2026-06-18T00:00:00.000Z' } },
      asOf,
    );
    expect(h.score).toBeGreaterThanOrEqual(80);
    expect(h.band).toBe('healthy');
  });

  it('a stale, overdue customer scores poorly', () => {
    const h = customerHealth({ ...empty, overdueAmount: 1000 }, asOf);
    expect(h.score).toBeLessThan(60);
    expect(['inactive', 'critical']).toContain(h.band);
  });
});
