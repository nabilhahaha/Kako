import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeCoverage, COVERAGE_WINDOW_DAYS, type CustomerCoverage } from './coverage-status';
import type { PlanCadence } from './cadence';

/**
 * Customer coverage read-model loader (CJ-3). Read-only: reads existing
 * erp_journey_plans (target cadence) + erp_visits (actuals) over a rolling
 * window and composes the pure coverage status. RLS-scoped by the caller's
 * client. One loader behind every coverage surface (Customer 360, coverage list,
 * dashboards) — no duplicated logic.
 */
export { COVERAGE_WINDOW_DAYS } from './coverage-status';
export type { CustomerCoverage, CoverageStatus } from './coverage-status';

function isoDaysAgo(asOf: string, days: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function loadCustomerCoverage(
  supabase: SupabaseClient,
  customerIds: string[],
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, CustomerCoverage>> {
  const out = new Map<string, CustomerCoverage>();
  if (customerIds.length === 0) return out;
  const from = isoDaysAgo(asOf, COVERAGE_WINDOW_DAYS);

  const safe = async <T>(fn: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => {
    try { const { data, error } = await fn(); return error ? [] : ((data as T[]) ?? []); } catch { return []; }
  };

  const [plans, visits] = await Promise.all([
    safe<{ customer_id: string; day_of_week: string; frequency: string; effective_from: string; effective_to: string | null }>(() =>
      supabase
        .from('erp_journey_plans')
        .select('customer_id, day_of_week, frequency, effective_from, effective_to')
        .in('customer_id', customerIds)
        .eq('status', 'active'),
    ),
    safe<{ customer_id: string; visit_date: string }>(() =>
      supabase
        .from('erp_visits')
        .select('customer_id, visit_date')
        .in('customer_id', customerIds)
        .gte('visit_date', from)
        .lte('visit_date', asOf),
    ),
  ]);

  const plansBy = new Map<string, PlanCadence[]>();
  for (const p of plans) {
    const list = plansBy.get(p.customer_id) ?? [];
    list.push({ dayOfWeek: p.day_of_week, frequency: p.frequency, effectiveFrom: p.effective_from, effectiveTo: p.effective_to });
    plansBy.set(p.customer_id, list);
  }
  const visitsBy = new Map<string, string[]>();
  for (const v of visits) {
    const list = visitsBy.get(v.customer_id) ?? [];
    list.push(v.visit_date);
    visitsBy.set(v.customer_id, list);
  }

  for (const id of customerIds) {
    out.set(id, computeCoverage(plansBy.get(id) ?? [], visitsBy.get(id) ?? [], from, asOf));
  }
  return out;
}
