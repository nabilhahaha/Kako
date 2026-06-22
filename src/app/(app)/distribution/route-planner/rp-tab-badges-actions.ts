'use server';

// ============================================================================
// Phase C5 — lightweight tab badge counts for the Route Planner workspace. Company-scoped
// head-count READS only (no rows fetched). Read-only; behind the same gated page.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

export interface RpTabBadges {
  datasets: number;
  missionsOpen: number;   // assigned + in_progress
  requestsOpen: number;   // created / pending_* / approved / need_more_info
  sources: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getRpTabBadges(): Promise<Result<RpTabBadges>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const company = ctx.companyId;

  const [ds, mo, ro, src] = await Promise.all([
    sb.from('erp_rp_datasets').select('*', { count: 'exact', head: true }).eq('company_id', company),
    sb.from('erp_rp_missions').select('*', { count: 'exact', head: true }).eq('company_id', company).in('status', ['assigned', 'in_progress']),
    sb.from('erp_route_planner_requests').select('*', { count: 'exact', head: true }).eq('company_id', company).in('status', ['created', 'pending_manager_review', 'approved', 'pending_admin_action', 'need_more_info']),
    sb.from('erp_rp_data_sources').select('*', { count: 'exact', head: true }).eq('company_id', company),
  ]);

  return { ok: true, data: { datasets: ds.count ?? 0, missionsOpen: mo.count ?? 0, requestsOpen: ro.count ?? 0, sources: src.count ?? 0 } };
}
