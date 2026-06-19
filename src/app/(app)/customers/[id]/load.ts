import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCustomerStatement, type CustomerStatementResult } from '@/lib/erp/customer-statement-server';
import { customerActivity, type CustomerActivity } from '@/app/(app)/home-actions';
import { sortTimeline, type TimelineEvent } from '@/lib/erp/timeline';

/**
 * Customer detail bundle (P5-1) — the single parallel loader behind the Customer
 * Workbench / Customer 360, mirroring the Companies `loadCompanyDetailBundle`
 * pattern. Reuse-only: it composes existing loaders/actions and reads existing
 * tables (RLS-scoped) — no new business logic, no permission/RLS/workflow change.
 *
 * The `timeline` is the TRUE Customer 360 activity (per the approved richer
 * scope): the existing financial timeline (invoices · payments · returns, from
 * `customerActivity`) merged with **customer requests** (→ `note`) and **visit
 * outcomes** (→ `visit`), reusing the existing `TimelineEvent`/`sortTimeline`
 * types so the existing ActivityTimeline renderer is unchanged.
 */
/** G2: last-event-per-kind summary (ISO date strings or null). Orders come from
 *  `erp_sales_orders` (distinct from invoices); the rest derive from the merged
 *  360 timeline. */
export interface CustomerLastActivity {
  lastVisit: string | null;
  lastOrder: string | null;
  lastInvoice: string | null;
  lastCollection: string | null;
  lastReturn: string | null;
}

export interface CustomerDetailBundle {
  statement: CustomerStatementResult;
  activity: CustomerActivity;
  /** Merged + sorted 360 timeline: financial + requests + visits. */
  timeline: TimelineEvent[];
  requestCount: number;
  visitCount: number;
  /** G2: last visit · order · invoice · collection · return. */
  lastActivity: CustomerLastActivity;
}

async function safeRows<T>(fn: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await fn();
    if (error) return [];
    return (data as T[]) ?? [];
  } catch {
    return [];
  }
}

export async function loadCustomerDetailBundle(
  supabase: SupabaseClient,
  customerId: string,
): Promise<CustomerDetailBundle | null> {
  // Reuse the authoritative statement loader + the financial activity action.
  const [statement, act] = await Promise.all([
    loadCustomerStatement(supabase, customerId),
    customerActivity(customerId),
  ]);
  if (!statement) return null;
  const activity: CustomerActivity = act.ok && act.data
    ? act.data
    : { name: statement.customer.name, balance: statement.customer.balance, overdue: 0, invoiceCount: 0, timeline: [] };

  // Enrich the 360 with existing field data (read-only, RLS-scoped).
  const [requests, visits, lastOrders] = await Promise.all([
    safeRows<{ id: string; kind: string; status: string; created_at: string }>(() =>
      supabase
        .from('erp_customer_requests')
        .select('id, kind, status, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(30),
    ),
    safeRows<{ id: string; outcome: string; note: string | null; created_at: string }>(() =>
      supabase
        .from('erp_visit_outcomes')
        .select('id, outcome, note, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(30),
    ),
    // G2: last sales ORDER (distinct from invoices), excluding drafts.
    safeRows<{ created_at: string }>(() =>
      supabase
        .from('erp_sales_orders')
        .select('created_at')
        .eq('customer_id', customerId)
        .neq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1),
    ),
  ]);

  const extra: TimelineEvent[] = [
    ...requests.map((r) => ({ date: r.created_at, kind: 'note' as const, title: `request:${r.kind}`, status: r.status })),
    ...visits.map((v) => ({ date: v.created_at, kind: 'visit' as const, title: `visit:${v.outcome}`, status: v.note ?? undefined })),
  ];

  const timeline = sortTimeline([...activity.timeline, ...extra]);
  // Last-event-per-kind: timeline is newest-first, so the first match wins.
  const firstOf = (k: TimelineEvent['kind']) => timeline.find((e) => e.kind === k)?.date ?? null;
  const lastActivity: CustomerLastActivity = {
    lastVisit: firstOf('visit'),
    lastOrder: lastOrders[0]?.created_at ?? null,
    lastInvoice: firstOf('invoice'),
    lastCollection: firstOf('payment'),
    lastReturn: firstOf('return'),
  };

  return {
    statement,
    activity,
    timeline,
    requestCount: requests.length,
    visitCount: visits.length,
    lastActivity,
  };
}
