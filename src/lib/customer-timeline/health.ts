// ============================================================================
// Customer Timeline — health/risk scoring (Phase 3 FMCG). Pure. Derives the
// customer health timeline (last visit/order/collection/return/near-expiry/
// promotion/ownership change) from the event stream and computes configurable
// health / risk / relationship-strength scores. No hardcoded thresholds baked into
// logic — weights are parameters. No I/O (clock injected via `asOf`).
// ============================================================================

import { categoryFor } from './catalog';
import type { TimelineEvent, CustomerHealthInputs } from './types';

const MS_PER_DAY = 86_400_000;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const daysBetween = (from: string, to: string): number => Math.floor((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

function lastAt(events: readonly TimelineEvent[], pred: (e: TimelineEvent) => boolean): string | null {
  let best: string | null = null;
  for (const e of events) if (pred(e) && (!best || e.eventAt > best)) best = e.eventAt;
  return best;
}

export interface CustomerHealthTimeline {
  lastVisit: string | null;
  lastOrder: string | null;
  lastCollection: string | null;
  lastReturn: string | null;
  lastNearExpiry: string | null;
  lastPromotion: string | null;
  lastOwnershipChange: string | null;
}

/** Extract the customer health timeline (last-event-per-kind). Pure. */
export function customerHealthTimeline(events: readonly TimelineEvent[]): CustomerHealthTimeline {
  const cat = (e: TimelineEvent) => categoryFor(e.eventType);
  return {
    lastVisit: lastAt(events, (e) => cat(e) === 'visit'),
    lastOrder: lastAt(events, (e) => cat(e) === 'sales'),
    lastCollection: lastAt(events, (e) => cat(e) === 'collection' && e.eventType !== 'overdue_status'),
    lastReturn: lastAt(events, (e) => cat(e) === 'return'),
    lastNearExpiry: lastAt(events, (e) => cat(e) === 'near_expiry'),
    lastPromotion: lastAt(events, (e) => e.eventType === 'promotion_approved' || e.eventType === 'listing_fee_approved' || e.eventType === 'visibility_agreement'),
    lastOwnershipChange: lastAt(events, (e) => cat(e) === 'ownership'),
  };
}

/** Derive scoring inputs from the event stream as of `asOf`. Pure. */
export function deriveHealthInputs(events: readonly TimelineEvent[], asOf: string): CustomerHealthInputs {
  const tl = customerHealthTimeline(events);
  const cat = (e: TimelineEvent) => categoryFor(e.eventType);
  const within90 = (e: TimelineEvent) => daysBetween(e.eventAt, asOf) <= 90;
  const created = lastAt(events, (e) => e.eventType === 'customer_created');
  const lastFullCollection = lastAt(events, (e) => e.eventType === 'full_collection');
  const lastOverdue = lastAt(events, (e) => e.eventType === 'overdue_status');
  const nearExpiryDetected = events.filter((e) => e.eventType === 'near_expiry_detected').length;
  const nearExpiryResolved = events.filter((e) => e.eventType === 'recovery_action' || e.eventType === 'return_action').length;
  return {
    daysSinceLastOrder: tl.lastOrder ? daysBetween(tl.lastOrder, asOf) : null,
    daysSinceLastVisit: tl.lastVisit ? daysBetween(tl.lastVisit, asOf) : null,
    daysSinceLastCollection: tl.lastCollection ? daysBetween(tl.lastCollection, asOf) : null,
    hasOverdue: !!lastOverdue && (!lastFullCollection || lastOverdue > lastFullCollection),
    nearExpiryOpen: Math.max(0, nearExpiryDetected - nearExpiryResolved),
    returnsLast90: events.filter((e) => cat(e) === 'return' && e.eventType === 'return_submitted' && within90(e)).length,
    ordersLast90: events.filter((e) => cat(e) === 'sales' && within90(e)).length,
    tenureDays: created ? daysBetween(created, asOf) : null,
  };
}

export interface HealthWeights { orderRecency: number; visitRecency: number; overdue: number; nearExpiry: number; returns: number }
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = { orderRecency: 30, visitRecency: 20, overdue: 25, nearExpiry: 15, returns: 10 };

/** 0..100 health (higher = healthier). Pure. */
export function healthScore(i: CustomerHealthInputs, w: HealthWeights = DEFAULT_HEALTH_WEIGHTS): number {
  let score = 100;
  if (i.daysSinceLastOrder == null || i.daysSinceLastOrder > 30) score -= w.orderRecency * Math.min(1, (i.daysSinceLastOrder ?? 60) / 60);
  if (i.daysSinceLastVisit == null || i.daysSinceLastVisit > 14) score -= w.visitRecency * Math.min(1, (i.daysSinceLastVisit ?? 30) / 30);
  if (i.hasOverdue) score -= w.overdue;
  if (i.nearExpiryOpen > 0) score -= w.nearExpiry * Math.min(1, i.nearExpiryOpen / 5);
  if (i.returnsLast90 > 0) score -= w.returns * Math.min(1, i.returnsLast90 / 5);
  return clamp(score);
}

/** 0..100 risk (higher = riskier). Pure. */
export function riskScore(i: CustomerHealthInputs, w: HealthWeights = DEFAULT_HEALTH_WEIGHTS): number {
  return clamp(100 - healthScore(i, w));
}

/** 0..100 relationship strength (tenure + order frequency + visit consistency). Pure. */
export function relationshipStrength(i: CustomerHealthInputs): number {
  const tenure = Math.min(40, ((i.tenureDays ?? 0) / 365) * 40);          // up to 40 for ≥1yr
  const frequency = Math.min(40, (i.ordersLast90 / 12) * 40);             // up to 40 for ~weekly
  const visiting = i.daysSinceLastVisit == null ? 0 : Math.max(0, 20 - (i.daysSinceLastVisit / 14) * 20); // up to 20
  return clamp(tenure + frequency + visiting);
}
