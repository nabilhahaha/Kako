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
export interface CustomerDetailBundle {
  statement: CustomerStatementResult;
  activity: CustomerActivity;
  /** Merged + sorted 360 timeline: financial + requests + visits. */
  timeline: TimelineEvent[];
  requestCount: number;
  visitCount: number;
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
  const [requests, visits] = await Promise.all([
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
  ]);

  const extra: TimelineEvent[] = [
    ...requests.map((r) => ({ date: r.created_at, kind: 'note' as const, title: `request:${r.kind}`, status: r.status })),
    ...visits.map((v) => ({ date: v.created_at, kind: 'visit' as const, title: `visit:${v.outcome}`, status: v.note ?? undefined })),
  ];

  return {
    statement,
    activity,
    timeline: sortTimeline([...activity.timeline, ...extra]),
    requestCount: requests.length,
    visitCount: visits.length,
  };
}
