'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { loadTisDataset } from '@/lib/tis/server';
import { balanceRoutes, type RouteConstraints, type RoutePlan } from '@/lib/tis/optimize-routes';
import { compareScenarios, type ScenarioComparison } from '@/lib/tis/scenario';

export interface RouteOptimizationResult {
  plan: RoutePlan;
  /** [Current Plan, Optimized] on identical TIS-0 metrics. */
  compare: ScenarioComparison[];
}

/**
 * RO-2 — generate a balanced route plan over the live, RLS-scoped TIS dataset and
 * compare it against the current plan on identical metrics. Read-only (no write);
 * the result is a TIS-0 scenario, ready for export (RO-3) or apply (RO-4, fork).
 */
export async function generateRoutePlan(
  constraints: RouteConstraints,
): Promise<{ ok: true; data: RouteOptimizationResult } | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const dataset = await loadTisDataset(supabase);
  if (dataset.customers.length === 0) return { ok: false, error: 'no_customers' };

  const plan = balanceRoutes(dataset.customers, constraints);
  if (plan.routeCount === 0) return { ok: false, error: 'no_customers' };

  const compare = compareScenarios(dataset, [{ id: 'optimized', name: 'Optimized', assignments: plan.assignments }]);
  return { ok: true, data: { plan, compare } };
}
