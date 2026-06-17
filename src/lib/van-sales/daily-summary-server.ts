import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeDailySummary, buildActivityTimeline, activityTotals,
  type DailySummary, type ActivityRow, type ActivityTotals, type OutcomeEvent,
} from './daily-summary';
import { TXN_OUTCOMES, type VisitOutcomeKind } from './visit-outcome';

// One loader → one source of truth for the Daily Summary. Used by both the
// dashboard (/field/van-sales/summary) and the printable report
// (/print/daily-summary), so the KPIs, activity timeline and totals never
// diverge. All metrics are derived from EXISTING data (work session + visit
// outcomes + invoice/collection/return + route plan). Read-only.

const ACTIVE_INV = ['issued', 'paid', 'partially_paid', 'overdue'];

export interface DailySummaryBundle {
  summary: DailySummary;
  timeline: ActivityRow[];
  totals: ActivityTotals;
  /** Route plan adherence (visited / planned) — the "route compliance" KPI. */
  route: { planned: number; visited: number; remaining: number; compliancePct: number };
  custName: Map<string, string>;
  custCode: Map<string, string>;
}

export async function loadDailySummaryBundle(
  supabase: SupabaseClient,
  salesmanId: string,
  date: string,
  locale: string,
): Promise<DailySummaryBundle> {
  const dayStart = `${date}T00:00:00`;
  const [sessionRow, outcomesRes, invRes, collRes, retRes, planRes, visRes] = await Promise.all([
    supabase.from('erp_work_sessions').select('opened_at, closed_at').eq('salesman_id', salesmanId).eq('work_date', date).maybeSingle(),
    supabase.from('erp_visit_outcomes').select('outcome, reason, customer_id, created_at').eq('salesman_id', salesmanId).eq('visit_date', date),
    supabase.from('erp_invoices').select('id, invoice_number, customer_id, net_amount, created_at').eq('created_by', salesmanId).in('status', ACTIVE_INV).gte('created_at', dayStart),
    supabase.from('erp_collections').select('id, collection_number, customer_id, amount, created_at').eq('received_by', salesmanId).gte('created_at', dayStart),
    supabase.from('erp_sales_returns').select('id, return_number, customer_id, total_amount, created_at').eq('created_by', salesmanId).gte('created_at', dayStart),
    supabase.rpc('erp_today_journey', { p_salesman: salesmanId, p_date: date }),
    supabase.from('erp_visits').select('customer_id').eq('salesman_id', salesmanId).eq('visit_date', date),
  ]);

  const session = sessionRow.data as { opened_at: string | null; closed_at: string | null } | null;
  const outcomeRows = (outcomesRes.data ?? []) as { outcome: string; reason: string | null; customer_id: string; created_at: string }[];
  const invRows = (invRes.data ?? []) as { id: string; invoice_number: string; customer_id: string; net_amount: number; created_at: string }[];
  const collRows = (collRes.data ?? []) as { id: string; collection_number: string; customer_id: string; amount: number; created_at: string }[];
  const retRows = (retRes.data ?? []) as { id: string; return_number: string; customer_id: string; total_amount: number; created_at: string }[];

  const outcomes: OutcomeEvent[] = outcomeRows.map((o) => ({ kind: o.outcome as VisitOutcomeKind, customerId: o.customer_id, at: o.created_at }));
  const summary = computeDailySummary({
    dayOpenedAt: session?.opened_at ?? null,
    dayClosedAt: session?.closed_at ?? null,
    nowIso: new Date().toISOString(),
    outcomes,
    invoices: invRows.map((i) => ({ amount: Number(i.net_amount ?? 0), at: i.created_at })),
    collections: collRows.map((c) => ({ amount: Number(c.amount ?? 0), at: c.created_at })),
    returns: retRows.map((r) => ({ at: r.created_at })),
  });

  const txn = new Set<string>(TXN_OUTCOMES);
  const timeline = buildActivityTimeline({
    invoices: invRows.map((i) => ({ id: i.id, customerId: i.customer_id, number: i.invoice_number, amount: Number(i.net_amount ?? 0), at: i.created_at })),
    collections: collRows.map((c) => ({ id: c.id, customerId: c.customer_id, number: c.collection_number, amount: Number(c.amount ?? 0), at: c.created_at })),
    returns: retRows.map((r) => ({ id: r.id, customerId: r.customer_id, number: r.return_number, amount: Number(r.total_amount ?? 0), at: r.created_at })),
    outcomes: outcomeRows.filter((o) => !txn.has(o.outcome)).map((o) => ({ customerId: o.customer_id, outcome: o.outcome as VisitOutcomeKind, reason: o.reason, at: o.created_at })),
  });
  const totals = activityTotals(timeline);

  // Route plan adherence.
  const planned = ((planRes.data ?? []) as unknown[]).length;
  const visited = new Set(((visRes.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id)).size;
  const remaining = Math.max(planned - visited, 0);
  const compliancePct = planned > 0 ? Math.round((visited / planned) * 100) : 100;

  // Customer names + codes for the timeline.
  const custIds = Array.from(new Set(timeline.map((r) => r.customerId)));
  const custName = new Map<string, string>();
  const custCode = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custs } = await supabase.from('erp_customers').select('id, name, name_ar, code').in('id', custIds);
    for (const c of (custs as { id: string; name: string; name_ar: string | null; code: string | null }[]) ?? []) {
      custName.set(c.id, locale === 'ar' ? c.name_ar || c.name : c.name);
      if (c.code) custCode.set(c.id, c.code);
    }
  }

  return { summary, timeline, totals, route: { planned, visited, remaining, compliancePct }, custName, custCode };
}
