/**
 * Activity timeline — pure helpers (no I/O). Builds a unified, newest-first
 * activity feed for a record (e.g. Customer 360) from already-authorized rows.
 * Pattern adapted from Salesforce/Twenty CRM/HubSpot record timelines. Pure +
 * testable; the server action supplies the RLS-scoped rows.
 */

export type TimelineKind = 'invoice' | 'payment' | 'visit' | 'return' | 'note';

export interface TimelineEvent {
  date: string; // ISO timestamp/date
  kind: TimelineKind;
  title: string;
  amount?: number | null;
  href?: string;
  status?: string;
}

/** Newest-first, stable for equal timestamps. */
export function sortTimeline(events: readonly TimelineEvent[]): TimelineEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : a.i - b.i))
    .map((x) => x.e);
}

/** Group a (sorted) feed by calendar day (YYYY-MM-DD), preserving order. */
export function groupByDay(events: readonly TimelineEvent[]): { day: string; events: TimelineEvent[] }[] {
  const sorted = sortTimeline(events);
  const order: string[] = [];
  const map = new Map<string, TimelineEvent[]>();
  for (const e of sorted) {
    const day = e.date.slice(0, 10);
    if (!map.has(day)) {
      map.set(day, []);
      order.push(day);
    }
    map.get(day)!.push(e);
  }
  return order.map((day) => ({ day, events: map.get(day)! }));
}
