// Daily Summary — PURE compute (no I/O). Phase 1 is READ-ONLY and derived ONLY
// from data that already exists (work session + visit outcomes + invoice /
// collection / return timestamps). Metrics that need start/end capture (visit /
// invoice / collection DURATIONS, productive hours) are NOT computed here — they
// arrive in Phase 2 once those timestamps are persisted. Idle/transition is
// approximated from the gaps between consecutive recorded activities.

import type { VisitOutcomeKind } from './visit-outcome';

export interface OutcomeEvent { kind: VisitOutcomeKind; customerId: string; at: string }
export interface AmountEvent { amount: number; at: string }
export interface TimeEvent { at: string }

export interface DailySummaryInput {
  dayOpenedAt: string | null;
  dayClosedAt: string | null;
  /** Now (ISO) — used only to mark the live cutoff for an open day. */
  nowIso: string;
  outcomes: OutcomeEvent[];
  invoices: AmountEvent[];
  collections: AmountEvent[];
  returns: TimeEvent[];
}

export interface DailySummary {
  /** Day still open (not closed) → the summary is LIVE ("حتى الآن"). */
  open: boolean;
  dayOpenedAt: string | null;
  dayClosedAt: string | null;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  // Visit counts (one outcome row = one visit).
  visits: number;
  customersVisited: number;
  salesVisits: number;
  collectionVisits: number;
  returnVisits: number;
  noSaleVisits: number;
  // Distinct customers by outcome.
  salesCustomers: number;
  collectionCustomers: number;
  noSaleCustomers: number;
  // Transactions.
  salesAmount: number;
  collectionAmount: number;
  invoiceCount: number;
  collectionCount: number;
  returnCount: number;
  // Highlights.
  noSaleRepeatCustomers: number;        // customers with ≥2 no-sale visits
  longestGapMinutes: number | null;     // approx idle: max gap between activities
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function ts(s: string): number { const n = Date.parse(s); return Number.isNaN(n) ? NaN : n; }
function distinct<T>(xs: T[]): number { return new Set(xs).size; }

export function computeDailySummary(input: DailySummaryInput): DailySummary {
  const outcomes = input.outcomes ?? [];
  const invoices = input.invoices ?? [];
  const collections = input.collections ?? [];
  const returns = input.returns ?? [];

  const byKind = (k: VisitOutcomeKind) => outcomes.filter((o) => o.kind === k);
  const sale = byKind('new_sale'), coll = byKind('collection'), ret = byKind('return'), nosale = byKind('no_sale');

  // No-sale repeat customers: a customer with ≥2 no-sale visits today.
  const noSaleByCust = new Map<string, number>();
  for (const o of nosale) noSaleByCust.set(o.customerId, (noSaleByCust.get(o.customerId) ?? 0) + 1);
  const noSaleRepeatCustomers = Array.from(noSaleByCust.values()).filter((n) => n >= 2).length;

  // Activity timeline (all recorded events) → first/last + longest gap (approx idle).
  const times = [
    ...outcomes.map((o) => o.at),
    ...invoices.map((i) => i.at),
    ...collections.map((c) => c.at),
    ...returns.map((x) => x.at),
  ].map(ts).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);

  const firstActivityAt = times.length ? new Date(times[0]).toISOString() : null;
  const lastActivityAt = times.length ? new Date(times[times.length - 1]).toISOString() : null;
  let longestGapMinutes: number | null = null;
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] - times[i - 1]) / 60_000;
    if (longestGapMinutes == null || gap > longestGapMinutes) longestGapMinutes = Math.round(gap);
  }

  return {
    open: !input.dayClosedAt,
    dayOpenedAt: input.dayOpenedAt,
    dayClosedAt: input.dayClosedAt,
    firstActivityAt,
    lastActivityAt,
    visits: outcomes.length,
    customersVisited: distinct(outcomes.map((o) => o.customerId)),
    salesVisits: sale.length,
    collectionVisits: coll.length,
    returnVisits: ret.length,
    noSaleVisits: nosale.length,
    salesCustomers: distinct(sale.map((o) => o.customerId)),
    collectionCustomers: distinct(coll.map((o) => o.customerId)),
    noSaleCustomers: distinct(nosale.map((o) => o.customerId)),
    salesAmount: r2(invoices.reduce((s, i) => s + Number(i.amount || 0), 0)),
    collectionAmount: r2(collections.reduce((s, c) => s + Number(c.amount || 0), 0)),
    invoiceCount: invoices.length,
    collectionCount: collections.length,
    returnCount: returns.length,
    noSaleRepeatCustomers,
    longestGapMinutes,
  };
}

// ── Day activity timeline (chronological report, not cards) ──────────────────

export type ActivityType = 'invoice' | 'collection' | 'return' | 'no_sale' | 'visit';

export interface DocEvent { id: string; customerId: string; number: string; amount: number; at: string }
export interface NonTxnOutcome { customerId: string; outcome: VisitOutcomeKind; reason: string | null; at: string }

export interface ActivityInput {
  invoices: DocEvent[];
  collections: DocEvent[];
  returns: DocEvent[];
  /** NON-transaction visit outcomes only (no_sale + legacy not-reached kinds). */
  outcomes: NonTxnOutcome[];
}

export interface ActivityRow {
  at: string;
  customerId: string;
  type: ActivityType;
  doc: string | null;
  /** Document id for drill-down (clickable). Null for non-document rows. */
  docId: string | null;
  amount: number | null;
  /** Reason/legacy-kind code for no_sale / visit rows (localized by the UI); null for completed txns. */
  reason: string | null;
}

/** Reasons / legacy kinds that mean "customer not reached" → shown as a Visit. */
const NOT_REACHED = new Set<string>(['closed', 'not_available', 'customer_closed', 'gps_exception']);

/**
 * One chronological timeline of the day's activity (ascending by time), built
 * from the actual documents (invoice / collection / return) plus the
 * non-transaction visit outcomes (no-sale / customer not reached). Transaction
 * outcomes are NOT added — their documents already represent them. Pure.
 */
export function buildActivityTimeline(input: ActivityInput): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const i of input.invoices ?? []) rows.push({ at: i.at, customerId: i.customerId, type: 'invoice', doc: i.number, docId: i.id, amount: Number(i.amount || 0), reason: null });
  for (const c of input.collections ?? []) rows.push({ at: c.at, customerId: c.customerId, type: 'collection', doc: c.number, docId: c.id, amount: Number(c.amount || 0), reason: null });
  for (const r of input.returns ?? []) rows.push({ at: r.at, customerId: r.customerId, type: 'return', doc: r.number, docId: r.id, amount: Number(r.amount || 0), reason: null });
  for (const o of input.outcomes ?? []) {
    const reason = o.reason ?? (o.outcome !== 'no_sale' ? o.outcome : null);
    const type: ActivityType = NOT_REACHED.has(reason ?? '') ? 'visit' : 'no_sale';
    rows.push({ at: o.at, customerId: o.customerId, type, doc: null, docId: null, amount: null, reason });
  }
  return rows.sort((a, b) => (ts(a.at) || 0) - (ts(b.at) || 0));
}

export interface ActivityTotals {
  totalSales: number;
  totalCollections: number;
  totalReturns: number;
  noSalesCount: number;
  closedCount: number;
  unavailableCount: number;
}

/** Day totals for the activity report footer. Pure. */
export function activityTotals(rows: ActivityRow[]): ActivityTotals {
  const sum = (t: ActivityType) => rows.filter((r) => r.type === t).reduce((s, r) => s + (r.amount ?? 0), 0);
  const reasonCount = (...codes: string[]) => rows.filter((r) => r.reason != null && codes.includes(r.reason)).length;
  return {
    totalSales: r2(sum('invoice')),
    totalCollections: r2(sum('collection')),
    totalReturns: r2(sum('return')),
    noSalesCount: rows.filter((r) => r.type === 'no_sale').length,
    closedCount: reasonCount('closed', 'customer_closed'),
    unavailableCount: reasonCount('not_available'),
  };
}

/** Drill-down URL for a document row (View + Print). Null for non-document rows. */
export function activityDocHref(type: ActivityType, docId: string | null): string | null {
  if (!docId) return null;
  switch (type) {
    case 'invoice': return `/print/invoices/${docId}`;
    case 'collection': return `/print/collection/${docId}`;
    case 'return': return `/sales/returns/${docId}/print`;
    default: return null;
  }
}

export interface ReasonCount { reason: string; count: number }

/** No-sales reasons summary: count per reason/legacy-kind across no-sale + not-
 *  reached visit rows, most frequent first. Reason codes localized by the UI. Pure. */
export function noSaleReasonBreakdown(rows: ActivityRow[]): ReasonCount[] {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    if ((r.type === 'no_sale' || r.type === 'visit') && r.reason) m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// ── Supervisor ranking ──────────────────────────────────────────────────────

export interface SalesmanDay { salesmanId: string; name: string; summary: DailySummary }
export type RankKey = 'salesAmount' | 'collectionAmount' | 'visits';

/** Sorted copy (desc) of the per-salesman rows by the chosen metric. Pure. */
export function rankSalesmen(rows: SalesmanDay[], by: RankKey): SalesmanDay[] {
  return [...rows].sort((a, b) => b.summary[by] - a.summary[by]);
}
