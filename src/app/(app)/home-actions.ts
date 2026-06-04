'use server';

/** ── Role-home & harvest signals — defensive, RLS-scoped aggregate reads ──────
 *
 *  Powers the role homes, Customer 360, Territory Health and Visit Coaching.
 *  Every read is wrapped so a missing object (e.g. production schema drift, where
 *  FMCG ops tables from later migrations may not yet exist) degrades to a safe
 *  default instead of throwing — like the Copilot `nextBestActions` action. All
 *  reads go through the caller's RLS-scoped client. No new tables, no schema
 *  change. ('use server' modules may only export async functions — shared
 *  types/constants live in `@/lib/erp/home-signals-types`.)
 */

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import type { ActionResult } from '@/lib/erp/guards';
import { today } from '@/lib/erp/work-session';
import type { HomeSignals } from '@/lib/erp/home-signals-types';
import type { TimelineEvent } from '@/lib/erp/timeline';
import type { RouteCoverage } from '@/lib/erp/territory';
import type { VisitMetrics } from '@/lib/erp/coaching';

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Aggregate home signals for the current user (defensive; never throws). */
export async function homeSignals(): Promise<ActionResult<HomeSignals>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const date = today();

  const monthStart = `${date.slice(0, 7)}-01`;
  const salesMtd = await safe(async () => {
    const { data } = await supabase
      .from('erp_invoices')
      .select('net_amount, created_at, status')
      .gte('created_at', `${monthStart}T00:00:00`)
      .in('status', ['issued', 'paid', 'partially_paid', 'overdue']);
    return (data ?? []).reduce((n, r) => n + Number((r as { net_amount: number | null }).net_amount ?? 0), 0);
  }, 0);

  const overdue = await safe(async () => {
    const { count } = await supabase
      .from('erp_invoices')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', date)
      .in('status', ['issued', 'partially_paid', 'overdue']);
    return count ?? 0;
  }, 0);

  const lostCustomers = await safe(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recent = await supabase.from('erp_invoices').select('customer_id').gte('created_at', `${cutoffStr}T00:00:00`);
    const activeIds = new Set((recent.data ?? []).map((r) => (r as { customer_id: string }).customer_id));
    const { data: custs } = await supabase.from('erp_customers').select('id');
    return (custs ?? []).filter((c) => !activeIds.has((c as { id: string }).id)).length;
  }, 0);

  const coveragePct = await safe(async () => {
    const { data } = await supabase
      .from('erp_work_sessions')
      .select('coverage_pct')
      .eq('salesman_id', ctx.userId)
      .eq('work_date', date)
      .neq('close_status', 'closed')
      .maybeSingle();
    const v = (data as { coverage_pct: number | null } | null)?.coverage_pct;
    return v == null ? null : Number(v);
  }, null);

  return { ok: true, data: { salesMtd, overdue, lostCustomers, coveragePct } };
}

// ── Customer 360 ──────────────────────────────────────────────────────────────

export interface CustomerActivity {
  name: string;
  balance: number;
  overdue: number;
  invoiceCount: number;
  timeline: TimelineEvent[];
}

/** A customer's summary + unified activity feed (invoices + payments), RLS-scoped. */
export async function customerActivity(customerId: string): Promise<ActionResult<CustomerActivity>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const date = today();

  const cust = await safe(async () => {
    const { data } = await supabase.from('erp_customers').select('name, balance').eq('id', customerId).maybeSingle();
    return data as { name: string; balance: number | null } | null;
  }, null);
  if (!cust) return { ok: false, error: 'not_found' };

  const invoices = await safe(async () => {
    const { data } = await supabase
      .from('erp_invoices')
      .select('id, invoice_number, net_amount, status, created_at, due_date')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(30);
    return (data ?? []) as { id: string; invoice_number: string; net_amount: number | null; status: string; created_at: string; due_date: string | null }[];
  }, []);

  const payments = await safe(async () => {
    const ids = invoices.map((i) => i.id);
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from('erp_payments')
      .select('id, amount, created_at')
      .in('invoice_id', ids)
      .order('created_at', { ascending: false })
      .limit(30);
    return (data ?? []) as { id: string; amount: number | null; created_at: string }[];
  }, []);

  const timeline: TimelineEvent[] = [
    ...invoices.map((i) => ({ date: i.created_at, kind: 'invoice' as const, title: i.invoice_number, amount: i.net_amount, href: `/sales/invoices/${i.id}/print`, status: i.status })),
    ...payments.map((p) => ({ date: p.created_at, kind: 'payment' as const, title: 'Payment', amount: p.amount })),
  ];

  const overdue = invoices.filter((i) => i.due_date != null && i.due_date < date && ['issued', 'partially_paid', 'overdue'].includes(i.status)).length;

  return {
    ok: true,
    data: { name: cust.name, balance: Number(cust.balance ?? 0), overdue, invoiceCount: invoices.length, timeline },
  };
}

// ── Territory health ─────────────────────────────────────────────────────────

/** Today's open-session coverage per rep (degrades to empty without the session
 *  tables). Adapted into a dependency-free territory health grid. */
export async function territoryHealth(): Promise<ActionResult<RouteCoverage[]>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const date = today();

  const rows = await safe(async () => {
    const { data } = await supabase
      .from('erp_work_sessions')
      .select('coverage_pct, salesman_id')
      .eq('work_date', date)
      .neq('close_status', 'closed');
    return (data ?? []) as { coverage_pct: number | null; salesman_id: string }[];
  }, []);

  const out: RouteCoverage[] = rows.map((r, i) => ({
    route: `#${i + 1} · ${String(r.salesman_id).slice(0, 8)}`,
    coveragePct: r.coverage_pct == null ? null : Number(r.coverage_pct),
  }));
  return { ok: true, data: out };
}

// ── Visit coaching ─────────────────────────────────────────────────────────────

/** Caller's own field metrics today (defensive) for the deterministic coach. */
export async function coachingData(): Promise<ActionResult<VisitMetrics>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const date = today();

  const session = await safe(async () => {
    const { data } = await supabase
      .from('erp_work_sessions')
      .select('coverage_pct, skipped_count')
      .eq('salesman_id', ctx.userId)
      .eq('work_date', date)
      .neq('close_status', 'closed')
      .maybeSingle();
    return data as { coverage_pct: number | null; skipped_count: number | null } | null;
  }, null);

  const gpsViolations = await safe(async () => {
    const { count } = await supabase
      .from('erp_visit_compliance')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${date}T00:00:00`)
      .eq('kind', 'gps_violation');
    return count ?? 0;
  }, 0);

  const outOfRoute = await safe(async () => {
    const { count } = await supabase
      .from('erp_visit_compliance')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${date}T00:00:00`)
      .eq('kind', 'out_of_route');
    return count ?? 0;
  }, 0);

  const minCoveragePct = await safe(async () => {
    if (!ctx.companyId) return null;
    const { data } = await supabase.from('erp_fmcg_settings').select('day_close_min_coverage').eq('company_id', ctx.companyId).maybeSingle();
    const v = (data as { day_close_min_coverage: number | null } | null)?.day_close_min_coverage;
    return v == null ? null : Number(v);
  }, null);

  return {
    ok: true,
    data: {
      coveragePct: session?.coverage_pct == null ? null : Number(session.coverage_pct),
      skipped: Number(session?.skipped_count ?? 0),
      gpsViolations,
      outOfRoute,
      minCoveragePct,
    },
  };
}
