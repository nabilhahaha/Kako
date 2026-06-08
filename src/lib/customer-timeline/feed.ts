// ============================================================================
// Customer Timeline — feed read-model (Phase 3 FMCG). Pure. Normalizes, filters,
// sorts (newest first), and groups timeline events for the Customer-360 feed.
// ============================================================================

import { categoryFor, type TimelineCategory } from './catalog';
import type { TimelineEvent } from './types';

/** Ensure the event's category matches the catalog (source of truth). Pure. */
export function normalizeEvent(e: TimelineEvent): TimelineEvent {
  return { ...e, eventCategory: categoryFor(e.eventType) };
}

export interface FeedFilter {
  category?: TimelineCategory;
  sourceModule?: string;
  eventType?: string;
  from?: string;   // ISO inclusive
  to?: string;     // ISO inclusive
}

/** Filtered, newest-first event feed. Pure. */
export function buildFeed(events: readonly TimelineEvent[], filter: FeedFilter = {}): TimelineEvent[] {
  return events
    .map(normalizeEvent)
    .filter((e) =>
      (!filter.category || e.eventCategory === filter.category) &&
      (!filter.sourceModule || e.sourceModule === filter.sourceModule) &&
      (!filter.eventType || e.eventType === filter.eventType) &&
      (!filter.from || e.eventAt >= filter.from) &&
      (!filter.to || e.eventAt <= filter.to))
    .sort((a, b) => b.eventAt.localeCompare(a.eventAt));
}

/** Group events by category. Pure. */
export function groupByCategory(events: readonly TimelineEvent[]): Record<string, TimelineEvent[]> {
  const out: Record<string, TimelineEvent[]> = {};
  for (const e of events.map(normalizeEvent)) (out[e.eventCategory] ??= []).push(e);
  return out;
}

/** Count events per category (desc). Pure. */
export function categoryCounts(events: readonly TimelineEvent[]): { category: string; count: number }[] {
  const g = groupByCategory(events);
  return Object.entries(g).map(([category, es]) => ({ category, count: es.length })).sort((a, b) => b.count - a.count);
}
