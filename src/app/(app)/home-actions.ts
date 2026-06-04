'use server';

/** ── Role-home signals — defensive, RLS-scoped aggregate reads ────────────────
 *
 *  Powers the Manager / Supervisor / Salesman home pages. Every read is wrapped
 *  so a missing object (e.g. production schema drift, where FMCG ops tables from
 *  later migrations may not yet exist) degrades to a safe default instead of
 *  throwing — exactly like the Copilot `nextBestActions` action. All reads go
 *  through the caller's RLS-scoped client; salesman figures are pinned to the
 *  caller's own id. No new tables, no schema change.
 *
 *  NOTE: a 'use server' module may only export async functions — the HomeSignals
 *  type and EMPTY default live in `@/lib/erp/home-signals-types`.
 */

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import type { ActionResult } from '@/lib/erp/guards';
import { today } from '@/lib/erp/work-session';
import type { HomeSignals } from '@/lib/erp/home-signals-types';

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

  // Sales MTD — sum of active invoices this calendar month (RLS-scoped).
  const monthStart = `${date.slice(0, 7)}-01`;
  const salesMtd = await safe(async () => {
    const { data } = await supabase
      .from('erp_invoices')
      .select('net_amount, created_at, status')
      .gte('created_at', `${monthStart}T00:00:00`)
      .in('status', ['issued', 'paid', 'partially_paid', 'overdue']);
    return (data ?? []).reduce((n, r) => n + Number((r as { net_amount: number | null }).net_amount ?? 0), 0);
  }, 0);

  // Overdue invoices.
  const overdue = await safe(async () => {
    const { count } = await supabase
      .from('erp_invoices')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', date)
      .in('status', ['issued', 'partially_paid', 'overdue']);
    return count ?? 0;
  }, 0);

  // Lost customers — customers with no invoice in the last 30 days.
  const lostCustomers = await safe(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recent = await supabase
      .from('erp_invoices')
      .select('customer_id')
      .gte('created_at', `${cutoffStr}T00:00:00`);
    const activeIds = new Set((recent.data ?? []).map((r) => (r as { customer_id: string }).customer_id));
    const { data: custs } = await supabase.from('erp_customers').select('id');
    return (custs ?? []).filter((c) => !activeIds.has((c as { id: string }).id)).length;
  }, 0);

  // Caller's own open session coverage today (field rep) — may be absent (drift).
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
