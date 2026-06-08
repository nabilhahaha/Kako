import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_TIMELINE_ENABLED,
  EVENT_CATALOG, KNOWN_TIMELINE_EVENTS, categoryFor,
  buildFeed, groupByCategory, categoryCounts, normalizeEvent,
  deriveHealthInputs, healthScore, riskScore, relationshipStrength, customerHealthTimeline,
  customer360,
  type TimelineEvent,
} from './index';
import type { OwnershipRecord } from '@/lib/ownership';

const ev = (eventType: string, eventAt: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
  companyId: 'co', customerId: 'C1', eventType, eventCategory: categoryFor(eventType), eventAt, ...extra,
});

describe('customer-timeline/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_CUSTOMER_TIMELINE;
    delete process.env.KAKO_CUSTOMER_TIMELINE;
    expect(CUSTOMER_TIMELINE_ENABLED()).toBe(false);
    process.env.KAKO_CUSTOMER_TIMELINE = '1';
    expect(CUSTOMER_TIMELINE_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_CUSTOMER_TIMELINE; else process.env.KAKO_CUSTOMER_TIMELINE = prev;
  });
});

describe('customer-timeline/catalog', () => {
  it('maps event types to categories (open for unknown)', () => {
    expect(categoryFor('invoice_issued')).toBe('sales');
    expect(categoryFor('zatca_submission')).toBe('compliance');
    expect(categoryFor('reassigned_to_salesman')).toBe('ownership');
    expect(categoryFor('something_new')).toBe('creation'); // unknown still recorded
    expect(KNOWN_TIMELINE_EVENTS.length).toBe(Object.keys(EVENT_CATALOG).length);
  });
});

describe('customer-timeline/feed', () => {
  const events = [
    ev('customer_created', '2026-01-01T00:00:00Z'),
    ev('invoice_issued', '2026-03-01T00:00:00Z', { sourceModule: 'sales' }),
    ev('completed_visit', '2026-02-01T00:00:00Z', { sourceModule: 'field' }),
  ];
  it('builds newest-first + filters', () => {
    const feed = buildFeed(events);
    expect(feed[0].eventType).toBe('invoice_issued');
    expect(buildFeed(events, { category: 'visit' })).toHaveLength(1);
    expect(buildFeed(events, { sourceModule: 'sales' })).toHaveLength(1);
    expect(buildFeed(events, { from: '2026-02-15T00:00:00Z' })).toHaveLength(1);
  });
  it('groups + counts by category', () => {
    expect(Object.keys(groupByCategory(events)).sort()).toEqual(['creation', 'sales', 'visit']);
    expect(categoryCounts(events).every((c) => c.count === 1)).toBe(true);
    expect(normalizeEvent({ ...events[1], eventCategory: 'creation' as never }).eventCategory).toBe('sales');
  });
});

describe('customer-timeline/health', () => {
  const asOf = '2026-04-01T00:00:00Z';
  const events = [
    ev('customer_created', '2025-01-01T00:00:00Z'),
    ev('invoice_issued', '2026-03-25T00:00:00Z'),
    ev('completed_visit', '2026-03-28T00:00:00Z'),
    ev('full_collection', '2026-03-26T00:00:00Z'),
  ];
  it('derives the health timeline + inputs', () => {
    const tl = customerHealthTimeline(events);
    expect(tl.lastOrder).toBe('2026-03-25T00:00:00Z');
    expect(tl.lastVisit).toBe('2026-03-28T00:00:00Z');
    const i = deriveHealthInputs(events, asOf);
    expect(i.daysSinceLastOrder).toBe(7);
    expect(i.hasOverdue).toBe(false);
    expect(i.tenureDays).toBeGreaterThan(400);
  });
  it('scores healthy when recent + risky when stale/overdue', () => {
    const healthy = deriveHealthInputs(events, asOf);
    expect(healthScore(healthy)).toBeGreaterThanOrEqual(90);
    const stale = deriveHealthInputs([ev('customer_created', '2025-01-01T00:00:00Z'), ev('overdue_status', '2026-02-01T00:00:00Z'), ev('near_expiry_detected', '2026-03-01T00:00:00Z')], asOf);
    expect(riskScore(stale)).toBeGreaterThan(riskScore(healthy));
    expect(relationshipStrength(healthy)).toBeGreaterThan(0);
  });
});

describe('customer-timeline/customer360 (reuses ownership)', () => {
  it('aggregates feed + health + ownership history + current owners', () => {
    const events = [ev('customer_created', '2025-01-01T00:00:00Z'), ev('invoice_issued', '2026-03-25T00:00:00Z')];
    const ownership: OwnershipRecord[] = [
      { entityType: 'customer', entityId: 'C1', ownerType: 'salesman', ownerId: 'S1', effectiveFrom: '2025-01-01T00:00:00Z', effectiveTo: '2026-01-01T00:00:00Z' },
      { entityType: 'customer', entityId: 'C1', ownerType: 'salesman', ownerId: 'S2', effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null },
    ];
    const v = customer360(events, ownership, 'C1', '2026-04-01T00:00:00Z');
    expect(v.feed[0].eventType).toBe('invoice_issued');
    expect(v.currentOwners.salesman).toBe('S2');
    expect(v.ownershipHistory).toHaveLength(2);
    expect(v.health.healthScore).toBeGreaterThan(0);
  });
});
