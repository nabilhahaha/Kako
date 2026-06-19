import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCustomerStatement, type CustomerStatementResult } from '@/lib/erp/customer-statement-server';
import { customerActivity, type CustomerActivity } from '@/app/(app)/home-actions';
import { sortTimeline, type TimelineEvent } from '@/lib/erp/timeline';
import { loadCustomerCoverage, type CustomerCoverage } from '@/lib/distribution/journey-plan/coverage-status-server';

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

/** G4: one customer transfer record (read-only history). */
export interface CustomerTransferRow {
  id: string;
  from_salesman_id: string | null;
  to_salesman_id: string | null;
  from_route_id: string | null;
  to_route_id: string | null;
  from_region_id: string | null;
  to_region_id: string | null;
  from_branch_id: string | null;
  to_branch_id: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  applied_at: string | null;
  decided_at: string | null;
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
  /** G4: transfer history (newest-first) + an id→display-name map for the
   *  involved salesmen/routes/regions/branches. */
  transfers: CustomerTransferRow[];
  transferNames: Record<string, string>;
  /** G7/visibility: open (pending) field-change requests — read-only transparency. */
  pendingChanges: CustomerPendingChange[];
  /** CJ-3: coverage status read-model (planned cadence vs actual visits, 28d). */
  coverage: CustomerCoverage | null;
}

/** G7: a pending customer change request (read-only visibility). */
export interface CustomerPendingChange {
  id: string;
  changes: Record<string, unknown>;
  reason: string | null;
  status: string;
  created_at: string;
  requesterName: string;
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

  // G4: transfer history + resolve the involved entity display names.
  const transfers = await safeRows<CustomerTransferRow>(() =>
    supabase
      .from('erp_customer_transfers')
      .select('id, from_salesman_id, to_salesman_id, from_route_id, to_route_id, from_region_id, to_region_id, from_branch_id, to_branch_id, reason, status, created_at, applied_at, decided_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50),
  );
  const transferNames = await resolveTransferNames(supabase, transfers);

  // CJ-3: coverage status read-model (reuses the journey-plan + visits engines).
  const coverageMap = await loadCustomerCoverage(supabase, [customerId]);
  const coverage = coverageMap.get(customerId) ?? null;

  // G7 visibility: open (pending) change requests + the requester display name.
  const pendingRows = await safeRows<{ id: string; changes: Record<string, unknown>; reason: string | null; status: string; created_at: string; requested_by: string | null }>(() =>
    supabase
      .from('erp_customer_change_requests')
      .select('id, changes, reason, status, created_at, requested_by')
      .eq('customer_id', customerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
  );
  const requesterIds = [...new Set(pendingRows.map((r) => r.requested_by).filter((x): x is string => !!x))];
  const requesterNames: Record<string, string> = {};
  if (requesterIds.length > 0) {
    const profs = await safeRows<{ id: string; full_name: string | null; email: string | null }>(() =>
      supabase.from('erp_profiles').select('id, full_name, email').in('id', requesterIds),
    );
    for (const p of profs) requesterNames[p.id] = p.full_name || p.email || '';
  }
  const pendingChanges: CustomerPendingChange[] = pendingRows.map((r) => ({
    id: r.id,
    changes: r.changes ?? {},
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
    requesterName: r.requested_by ? requesterNames[r.requested_by] || '—' : '—',
  }));

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
    transfers,
    transferNames,
    pendingChanges,
    coverage,
  };
}

/** Batch-resolve the salesman/route/region/branch ids referenced by the transfer
 *  rows into display names (read-only, RLS-scoped). Empty when there are none. */
async function resolveTransferNames(
  supabase: SupabaseClient,
  transfers: CustomerTransferRow[],
): Promise<Record<string, string>> {
  if (transfers.length === 0) return {};
  const uniq = (...ids: (string | null)[]) => [...new Set(ids.filter((x): x is string => !!x))];
  const salesmanIds = uniq(...transfers.flatMap((t) => [t.from_salesman_id, t.to_salesman_id]));
  const routeIds = uniq(...transfers.flatMap((t) => [t.from_route_id, t.to_route_id]));
  const regionIds = uniq(...transfers.flatMap((t) => [t.from_region_id, t.to_region_id]));
  const branchIds = uniq(...transfers.flatMap((t) => [t.from_branch_id, t.to_branch_id]));

  const [profs, rts, rgs, brs] = await Promise.all([
    salesmanIds.length ? safeRows<{ id: string; full_name: string | null; email: string | null }>(() => supabase.from('erp_profiles').select('id, full_name, email').in('id', salesmanIds)) : Promise.resolve([]),
    routeIds.length ? safeRows<{ id: string; name: string; name_ar: string | null }>(() => supabase.from('erp_routes').select('id, name, name_ar').in('id', routeIds)) : Promise.resolve([]),
    regionIds.length ? safeRows<{ id: string; name: string; name_ar: string | null }>(() => supabase.from('erp_regions').select('id, name, name_ar').in('id', regionIds)) : Promise.resolve([]),
    branchIds.length ? safeRows<{ id: string; name: string; name_ar: string | null }>(() => supabase.from('erp_branches').select('id, name, name_ar').in('id', branchIds)) : Promise.resolve([]),
  ]);
  const names: Record<string, string> = {};
  for (const p of profs) names[p.id] = p.full_name || p.email || '';
  for (const r of [...rts, ...rgs, ...brs]) names[r.id] = r.name_ar || r.name;
  return names;
}
